import crypto from 'crypto';
import cassandra from '../store/cassandra';
import config from '../config';
import db from '../store/db';
import { deserialize, redisCount } from '../util/utility';
import { Archive } from '../store/archive';

const matchArchive = new Archive('match');

function randomBigInt(byteCount: number) {
  return BigInt(`0x${crypto.randomBytes(byteCount).toString('hex')}`);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

function isDataComplete(match: Partial<ParsedMatch> | null) {
  // Check for a field from API and from parse
  // Once we are archiving from blobstore we could also check for replay_salt
  return Boolean(match && match.start_time && match.version && match.chat);
}

async function getTokenRange(size: number) {
  // Convert to signed 64-bit integer
  const signedBigInt = BigInt.asIntN(64, randomBigInt(8));
  const result = await cassandra.execute(
    'select match_id, token(match_id) from matches where token(match_id) >= ? limit ? ALLOW FILTERING;',
    [signedBigInt.toString(), size],
    {
      prepare: true,
      fetchSize: size,
      autoPage: true,
    },
  );
  return result.rows.map((row) => Number(row.match_id));
}

async function doArchiveFromLegacy(matchId: number) {
  if (!config.ENABLE_MATCH_ARCHIVE) {
    return;
  }
  let match = await getMatchDataFromLegacy(matchId);
  if (!match) {
    // We couldn't find this match so just skip it
    console.log('could not find match:', matchId);
    return;
  }
  if (!isDataComplete(match)) {
    console.log('data incomplete for match: ' + matchId);
    await deleteFromLegacy(matchId);
    return;
  }
  // Right now we avoid re-archiving a match by setting a flag in db
  // This flag also lets us know to look for the match in archive on read
  const isArchived = Boolean(
    (
      await db.raw(
        'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
        [matchId],
      )
    ).rows[0],
  );
  if (isArchived) {
    await deleteFromLegacy(matchId);
    return;
  }
  const playerMatches = await getPlayerMatchDataFromLegacy(matchId);
  if (!playerMatches.length) {
    // We couldn't find players for this match, some data was corrupted and we only have match level parsed data
    console.log('no players for match, deleting:', matchId);
    if (Number(matchId) < 7000000000) {
      // Just delete it from postgres too
      await db.raw('DELETE from parsed_matches WHERE match_id = ?', [
        Number(matchId),
      ]);
    }
    await deleteFromLegacy(matchId);
    return;
  }

  // Add to parsed_matches if not present
  await db.raw(
    'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
    [matchId],
  );

  const blob = Buffer.from(
    JSON.stringify({ ...match, players: match.players || playerMatches }),
  );
  const result = await matchArchive.archivePut(matchId.toString(), blob);
  redisCount('match_archive_write');
  if (result) {
    // Mark the match archived
    await db.raw(
      `UPDATE parsed_matches SET is_archived = TRUE WHERE match_id = ?`,
      [matchId],
    );
    await deleteFromLegacy(matchId);
  }
  return result;
}

async function deleteFromLegacy(id: number) {
  await Promise.all([
    cassandra.execute('DELETE from player_matches where match_id = ?', [id], {
      prepare: true,
    }),
    cassandra.execute('DELETE from matches where match_id = ?', [id], {
      prepare: true,
    }),
  ]);
}

async function getMatchDataFromLegacy(
  matchId: number,
): Promise<Partial<ParsedMatch> | null> {
  const result = await cassandra.execute(
    'SELECT * FROM matches where match_id = ?',
    [matchId],
    {
      prepare: true,
      fetchSize: 1,
      autoPage: true,
    },
  );
  const deserializedResult = result.rows.map((m) => deserialize(m));
  const final: ParsedMatch | null = deserializedResult[0];
  if (!final) {
    return null;
  }
  return final;
}

async function getPlayerMatchDataFromLegacy(
  matchId: number,
): Promise<ParsedPlayer[]> {
  const result = await cassandra.execute(
    'SELECT * FROM player_matches where match_id = ?',
    [matchId],
    {
      prepare: true,
      fetchSize: 24,
      autoPage: true,
    },
  );
  const deserializedResult = result.rows.map((m) => deserialize(m));
  return deserializedResult;
}

async function start() {
  while (true) {
    try {
      const page = await getTokenRange(10);
      await Promise.allSettled(page.map((i) => doArchiveFromLegacy(i)));
    } catch (e) {
      console.error(e);
    }
  }
}

async function start2() {
  while (true) {
    try {
      const rand = randomInt(1000000000, 6300000000);
      const page = [];
      for (let i = 0; i < 1000; i++) {
        page.push(rand + i);
      }
      console.log(page[0]);
      await Promise.allSettled(page.map((i) => doArchiveFromLegacy(i)));
    } catch (e) {
      console.error(e);
    }
  }
}

async function start3() {
  cassandra.eachRow(
    `SELECT match_id from matches LIMIT 1`,
    [],
    {
      prepare: true,
      fetchSize: 1,
    },
    (n, row) => {
      console.log(n, Number(row.match_id));
      doArchiveFromLegacy(Number(row.match_id));
    },
    (err, result) => {
      if (err) {
        throw err;
      }
      if (result.nextPage) {
        // Retrieve the following pages:
        // the same row handler from above will be used
        result.nextPage();
      } else {
        process.exit(0);
      }
    },
  );
}

start3();
