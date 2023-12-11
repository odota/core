// Cleans up old data from Cassandra and optionally archives it
import crypto from 'crypto';
import cassandra from '../store/cassandra';
import db from '../store/db';
import { doArchiveFromLegacy } from '../store/queries';
import { eachLimit } from '../util/utility';

function genRandomNumber(byteCount: number, radix: number): string {
  return BigInt(`0x${crypto.randomBytes(byteCount).toString('hex')}`).toString(
    radix
  );
}
async function start() {
  // Get the current max_match_id from postgres, subtract 200000000
  // const max = (await db.raw('select max(match_id) from public_matches'))
  //   ?.rows?.[0]?.max;
  // const limit = max - 200000000;
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
      // Put the ones that don't have parsed data into an array
      const unparsedIds: number[] = result.rows
        .filter((result) => result.version == null)
        .map((result) => result.match_id);
      const parsedIds: number[] = result.rows
        .filter((result) => result.version != null)
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

      // TODO (howard) remove insert once backfill complete
      await Promise.all(
        parsedIds.map((id) =>
          db.raw(
            'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
            [Number(id)]
          )
        )
      );

      const funcs = parsedIds.map((id) => () => doArchiveFromLegacy(id.toString()));
      await eachLimit(funcs, 10);

      // TODO (howard) Implement a cleanup for the blobstore to remove unparsed matches and archive parsed ones
    } catch (e) {
      console.log(e);
    }
  }
}
start();
