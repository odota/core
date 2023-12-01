const crypto = require("crypto");
const cassandra = require("../store/cassandra");
const db = require("../store/db");
const { archivePut } = require("../store/archive");
const { getMatchData, getPlayerMatchData } = require("../store/queries");
const config = require("../config");

function genRandomNumber(byteCount, radix) {
  return BigInt(`0x${  crypto.randomBytes(byteCount).toString("hex")}`).toString(
    radix
  );
}

const PARSED_DATA_DELETE_ID = 0;

async function start() {
  // Get the current max_match_id from postgres, subtract 200000000
  const max = (await db.raw("select max(match_id) from public_matches"))
    ?.rows?.[0]?.max;
  const limit = max - 200000000;
  while (true) {
    // delete older unparsed match/player_match rows
    // We can backfill these from Steam API on demand
    try {
      // Convert to signed bigint
      const randomBigint = BigInt.asIntN(64, genRandomNumber(8, 10));
      const result = await cassandra.execute(
        "select match_id, version, token(match_id) from matches where token(match_id) >= ? limit 500 ALLOW FILTERING;",
        [randomBigint.toString()],
        {
          prepare: true,
          fetchSize: 500,
          autoPage: true,
        }
      );

      // Put the ones that don't have parsed data or are too old into an array
      const ids = result.rows
        .filter(
          (result) =>
            (result.version == null ||
              result.match_id < PARSED_DATA_DELETE_ID) &&
            result.match_id < limit
        )
        .map((result) => result.match_id);
      console.log(
        ids.length,
        "out of",
        result.rows.length,
        "to delete, ex:",
        ids[0]?.toString()
      );

      // Delete matches
      await Promise.all(
        ids.map((id) =>
          cassandra.execute("DELETE from matches where match_id = ?", [id], {
            prepare: true,
          })
        )
      );
      // Delete player_matches
      await Promise.all(
        ids.map((id) =>
          cassandra.execute(
            "DELETE from player_matches where match_id = ?",
            [id],
            {
              prepare: true,
            }
          )
        )
      );
      const parsedIds = result.rows.filter(result => result.version != null).map(result => result.match_id);
      config.MATCH_ARCHIVE_S3_ENDPOINT && await Promise.all(parsedIds.map(id => doArchive(id)));

      // TODO remove insert once backfill complete
      await Promise.all(parsedIds.map(id => db.raw("INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING", [Number(id)])));
    } catch (e) {
      console.log(e);
    }
  }
}

async function doArchive(matchId) {
  // archive old parsed match blobs to s3 compatible storage
  const match = await getMatchData(matchId);
  const playerMatches = await getPlayerMatchData(matchId);
  const blob = Buffer.from(JSON.stringify({...match, players: playerMatches }));
  const result = await archivePut(matchId.toString(), blob);
  if (result) {
    // TODO Delete from Cassandra after archival
    // await cassandra.execute("DELETE from matches where match_id = ?", [matchId], {
    //   prepare: true,
    // });
    // await cassandra.execute(
    //   "DELETE from player_matches where match_id = ?",
    //   [matchId],
    //   {
    //     prepare: true,
    //   }
    // );
  }
  return;
}

start();
