import { gcFetcher } from "./fetcher/allFetchers.ts";
import db from "./store/db.ts";
import { redisCount } from "./store/redis.ts";
import { average, isRadiant, isTurbo } from "./util/utility.ts";
import { addReliableJob, runInLoop } from "./store/queue.ts";
import { PRIORITY } from "./util/priority.ts";

const DEFAULT_RATING = 4000;
const kFactor = 50;

await runInLoop(async function rate() {
  const { rows } = await db.query<{
    match_seq_num: number;
    match_id: number;
    radiant_win: boolean;
    game_mode: number;
  }>(
    "SELECT match_seq_num, match_id, radiant_win, game_mode from rating_queue order by match_seq_num ASC LIMIT 1",
  );
  const row = rows[0];
  if (!row) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }
  let gcMatch = await gcFetcher.getData(row.match_id);
  if (!gcMatch) {
    // Try re-queueing the job. If it's a duplicate, it'll be dropped
    await addReliableJob(
      {
        name: "gcdata",
        data: {
          match_id: row.match_id,
          reconcile: false,
        },
      },
      { priority: PRIORITY.AUTO_GCDATA },
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return;
  }
  // Get ratings of all players in the match, otherwise default value
  const accountIds = gcMatch.players.map((p) => p.account_id);
  // console.log(row.match_id, accountIds);
  if (!accountIds.every(Boolean)) {
    // undefined account ID, delete the row
    await db.query(
      "DELETE FROM rating_queue WHERE match_seq_num = $1",
      [row.match_seq_num],
    );
    redisCount("rater_skip");
    return;
  }
  const turbo = isTurbo(row);
  const tableName = turbo ? "player_computed_mmr_turbo" : "player_computed_mmr";
  const { rows: existingRatings } = await db.query<{
    account_id: number;
    computed_mmr: number;
  }>(
    `SELECT account_id, computed_mmr FROM ${tableName} WHERE account_id IN (${accountIds.map((_, i) => `$${i + 1}`).join(",")})`,
    [...accountIds],
  );
  const ratingMap = new Map<number, number>();
  existingRatings.forEach((r) => {
    ratingMap.set(r.account_id, r.computed_mmr);
  });
  // compute team averages
  const currRating1 = average(
    gcMatch.players
      .filter((p) => isRadiant(p))
      .map((p) => ratingMap.get(p.account_id!) ?? DEFAULT_RATING),
  );
  const currRating2 = average(
    gcMatch.players
      .filter((p) => !isRadiant(p))
      .map((p) => ratingMap.get(p.account_id!) ?? DEFAULT_RATING),
  );
  // apply elo formula to get delta
  const r1 = 10 ** (currRating1 / 400);
  const r2 = 10 ** (currRating2 / 400);
  const e1 = r1 / (r1 + r2);
  const e2 = r2 / (r1 + r2);
  const win1 = Number(row.radiant_win);
  const win2 = Number(!row.radiant_win);
  const ratingDiff1 = kFactor * (win1 - e1);
  const ratingDiff2 = kFactor * (win2 - e2);
  // Start transaction
  const trx = await db.connect();
  await trx.query("BEGIN");
  try {
    // Rate each player
    console.log("match %s, radiant_win: %s", row.match_id, row.radiant_win);
    for (let p of gcMatch.players) {
      const oldRating = ratingMap.get(p.account_id!) ?? DEFAULT_RATING;
      const delta = isRadiant(p) ? ratingDiff1 : ratingDiff2;
      // apply delta to each player (all players on a team will have the same rating change)
      const newRating = oldRating + delta;
      console.log(
        "account_id: %s, oldRating: %s, newRating: %s, delta: %s",
        p.account_id,
        oldRating,
        newRating,
        delta,
      );
      // Write ratings back to players
      await trx.query(
        `INSERT INTO ${tableName}(account_id, computed_mmr, delta, match_id) VALUES($1, $2, $3, $4) ON CONFLICT(account_id) DO UPDATE SET computed_mmr = EXCLUDED.computed_mmr, delta = EXCLUDED.delta, match_id = EXCLUDED.match_id`,
        [p.account_id, newRating, delta, row.match_id],
      );
    }
    // Delete row
    await trx.query(
      "DELETE FROM rating_queue WHERE match_seq_num = $1",
      [row.match_seq_num],
    );
    // Commit transaction
    await trx.query("COMMIT");
    redisCount("rater");
  } catch (e) {
    await trx.query("ROLLBACK");
    throw e;
  } finally {
    trx.release();
  }
}, 0);
