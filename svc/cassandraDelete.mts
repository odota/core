// Cleans up old data from Cassandra and optionally archives it
import crypto from 'crypto';
import cassandra from '../store/cassandra.mts';
import db from '../store/db.mts';
//@ts-ignore
import { archivePut } from '../store/archive.mts';
import { getMatchData, getPlayerMatchData } from '../store/queries.mjs';
import { eachLimit } from '../util/utility.mjs';
import config from '../config.js';

function genRandomNumber(byteCount: number, radix: number): string {
  return BigInt(`0x${crypto.randomBytes(byteCount).toString('hex')}`).toString(
    radix
  );
}
async function start() {
  // Get the current max_match_id from postgres, subtract 200000000
  const max = (await db.raw('select max(match_id) from public_matches'))
    ?.rows?.[0]?.max;
  const limit = max - 200000000;
  while (true) {
    // delete older unparsed match/player_match rows
    // We can backfill these from Steam API on demand
    try {
      // Convert to signed bigint
      //@ts-ignore
      const randomBigint = BigInt.asIntN(64, genRandomNumber(8, 10));
      const result = await cassandra.execute(
        'select match_id, version, token(match_id) from matches where token(match_id) >= ? limit 500 ALLOW FILTERING;',
        [randomBigint.toString()],
        {
          prepare: true,
          fetchSize: 500,
          autoPage: true,
        }
      );
      // Put the ones that don't have parsed data or are too old into an array
      const unparsedIds = result.rows
        .filter((result) => result.version == null && result.match_id < limit)
        .map((result) => result.match_id);
      const parsedIds = result.rows
        .filter((result) => result.version != null && result.match_id < limit)
        .map((result) => result.match_id);
      console.log(
        '%s unparsed to delete, %s parsed to archive, %s total, del ID: %s',
        unparsedIds.length,
        parsedIds.length,
        result.rows.length,
        unparsedIds[0]?.toString()
      );
      // NOTE: Due to lack of transactions there might be some orphaned player_matches without match
      // Delete player_matches
      await Promise.all(
        unparsedIds.map((id) =>
          cassandra.execute(
            'DELETE from player_matches where match_id = ?',
            [id],
            {
              prepare: true,
            }
          )
        )
      );
      // Delete matches
      await Promise.all(
        unparsedIds.map((id) =>
          cassandra.execute('DELETE from matches where match_id = ?', [id], {
            prepare: true,
          })
        )
      );
      if (config.MATCH_ARCHIVE_S3_ENDPOINT) {
        const funcs = parsedIds.map((id) => () => doArchive(id));
        await eachLimit(funcs, 10);
      }
      // TODO (howard) remove insert once backfill complete
      await Promise.all(
        parsedIds.map((id) =>
          db.raw(
            'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
            [Number(id)]
          )
        )
      );
    } catch (e) {
      console.log(e);
    }
  }
}
async function doArchive(matchId: number) {
  // archive old parsed match blobs to s3 compatible storage
  const match = await getMatchData(matchId);
  const playerMatches = await getPlayerMatchData(matchId);
  const blob = Buffer.from(
    JSON.stringify({ ...match, players: playerMatches })
  );
  const result = await archivePut(matchId.toString(), blob);
  if (result) {
    // TODO (howard) currently it's possible to re-archive with less data
    // because we don't make another gcdata call if we already have replay info
    // e.g. we archive a pro match with full data, it gets deleted and then request it for parse
    // We'll have api and parse data but not gcdata since we don't refetch it
    // But currently we archive anything that's parsed, so we can overwrite with less data
    // Need to find a solution for this before starting deletion
    // We can mark backfilled matches ineligible for archival (but then we can never archive missed matches from scanner)
    // We could ensure that all of api/gcdata/parsed is present (But then we won't archive older matches that don't have gcdata)
    // TODO (howard) Delete from Cassandra after archival
    // await cassandra.execute(
    //   "DELETE from player_matches where match_id = ?",
    //   [matchId],
    //   {
    //     prepare: true,
    //   }
    // );
    // await cassandra.execute("DELETE from matches where match_id = ?", [matchId], {
    //   prepare: true,
    // });
  }
  return;
}
start();
