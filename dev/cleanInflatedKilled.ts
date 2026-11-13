import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import config from "../config.ts";
import db from "../svc/store/db.ts";
import cassandra from "../svc/store/cassandra.ts";
import redis from "../svc/store/redis.ts";
import {
  blobArchive,
  matchArchive,
  playerArchive,
} from "../svc/store/archive.ts";
import { getAnonymousAccountId } from "../svc/util/utility.ts";

// #1623: matches parsed around 2018-03-12 16:30 to 2018-03-14 03:00 UTC came out
// with an inflated killed map (3778001726 has a player with 47,627 neutral kills
// in a 32 minute game), so everything computed from it is off too. The replays
// are gone, so the real counts can't be recovered: this drops killed from the
// stored match and nulls the player_caches columns computed from it.
//
// A match counts as affected when a player has more neutral kills than last hits.
// Dry run unless --apply is passed:
// node dev/cleanInflatedKilled.ts 3777000000 3780500000 --apply

// player_caches columns that computeMatchData fills from killed
const KILLED_COLUMNS = ["neutral_kills", "tower_kills", "courier_kills"];

function neutralKills(killed: Record<string, number> | undefined) {
  return Object.entries(killed ?? {})
    .filter(([key]) => key.startsWith("npc_dota_neutral"))
    .reduce((sum, [, count]) => sum + Number(count), 0);
}

async function readBlob(
  archive: typeof blobArchive,
  key: string,
): Promise<any | null> {
  const buf = await archive.archiveGet(key);
  return buf ? JSON.parse(buf.toString()) : null;
}

export async function cleanMatch(matchId: number, apply: boolean) {
  // Old matches are usually in the match archive (with the api data merged in),
  // but the separate parsed and api blobs may still be around too
  const archived = await readBlob(matchArchive, String(matchId));
  const parsed = await readBlob(blobArchive, `${matchId}_parsed`);
  const api = await readBlob(blobArchive, `${matchId}_api`);
  const killedBySlot = new Map<number, Record<string, number>>();
  for (const p of [...(parsed?.players ?? []), ...(archived?.players ?? [])]) {
    if (p.killed) {
      killedBySlot.set(p.player_slot, p.killed);
    }
  }
  const basePlayers: any[] = archived?.players ?? api?.players ?? [];
  const affected = basePlayers.some(
    (p) =>
      p.last_hits != null &&
      neutralKills(killedBySlot.get(p.player_slot)) > p.last_hits,
  );
  const accountIds = basePlayers
    .map((p) => Number(p.account_id))
    .filter((id) => id && id !== getAnonymousAccountId());
  if (!affected || !apply) {
    return { affected, accountIds };
  }

  for (const [archive, key, blob] of [
    [matchArchive, String(matchId), archived],
    [blobArchive, `${matchId}_parsed`, parsed],
  ] as const) {
    if (blob?.players.some((p: any) => p.killed)) {
      blob.players.forEach((p: any) => delete p.killed);
      await archive.archivePut(key, Buffer.from(JSON.stringify(blob)));
    }
  }
  if (config.ENABLE_MATCH_CACHE) {
    await redis?.del(`match:${matchId}`);
  }

  for (const accountId of accountIds) {
    const { rows } = await cassandra.execute(
      "SELECT match_id FROM player_caches WHERE account_id = ? AND match_id = ?",
      [accountId, matchId],
      { prepare: true },
    );
    if (rows.length) {
      await cassandra.execute(
        `UPDATE player_caches SET ${KILLED_COLUMNS.map((c) => `${c} = null`).join(", ")} WHERE account_id = ? AND match_id = ?`,
        [accountId, matchId],
        { prepare: true },
      );
    }
    // getPlayerMatches fills a null column from the player archive, so clear it there too
    const archivedMatches = playerArchive
      ? await readBlob(playerArchive, String(accountId))
      : null;
    const pm = archivedMatches?.find(
      (m: any) => Number(m.match_id) === matchId,
    );
    if (pm) {
      KILLED_COLUMNS.forEach((c) => delete pm[c]);
      await playerArchive!.archivePut(
        String(accountId),
        Buffer.from(JSON.stringify(archivedMatches)),
      );
    }
    // the player's temp file on this machine is out of date now
    await fs.unlink("./cache/" + accountId).catch(() => {});
  }
  return { affected, accountIds };
}

export async function cleanRange(from: number, to: number, apply: boolean) {
  const { rows } = await db.query(
    "SELECT match_id FROM parsed_matches WHERE match_id >= $1 AND match_id <= $2 ORDER BY match_id",
    [from, to],
  );
  let affected = 0;
  let players = 0;
  for (const row of rows) {
    const matchId = Number(row.match_id);
    const result = await cleanMatch(matchId, apply);
    if (result.affected) {
      affected += 1;
      players += result.accountIds.length;
      console.log(
        "%s %s (%s players)",
        apply ? "cleaned" : "would clean",
        matchId,
        result.accountIds.length,
      );
    }
  }
  console.log(
    "%s parsed matches checked, %s affected, %s player rows",
    rows.length,
    affected,
    players,
  );
  return { checked: rows.length, affected, players };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [from, to] = process.argv.slice(2, 4).map(Number);
  if (!from || !to) {
    console.log(
      "usage: node dev/cleanInflatedKilled.ts <from match_id> <to match_id> [--apply]",
    );
    process.exit(1);
  }
  await cleanRange(from, to, process.argv.includes("--apply"));
  process.exit(0);
}
