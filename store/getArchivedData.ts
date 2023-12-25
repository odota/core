import config from '../config';
import { Archive } from './archive';
import {
  getFullPlayerMatchesWithMetadata,
  getMatchDataFromBlobWithMetadata,
  getMatchDataFromLegacy,
  getPlayerMatchDataFromLegacy,
} from './queries';
import db from './db';
import redis from './redis';
import cassandra from './cassandra';
import type { PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { isDataComplete, redisCount } from '../util/utility';

const matchArchive = new Archive('match');
const playerArchive = new Archive('player');

export async function doArchivePlayerMatches(
  accountId: number,
): Promise<PutObjectCommandOutput | null> {
  if (!config.ENABLE_PLAYER_ARCHIVE) {
    return null;
  }
  // Fetch our combined list of archive and current, selecting all fields
  const full = await getFullPlayerMatchesWithMetadata(accountId);
  const toArchive = full[0];
  console.log(full[1]);
  toArchive.forEach((m, i) => {
    Object.keys(m).forEach((key) => {
      if (m[key as keyof ParsedPlayerMatch] === null) {
        // Remove any null values from the matches for storage
        delete m[key as keyof ParsedPlayerMatch];
      }
    });
  });
  // TODO (howard) Make sure the new list is longer than the old list
  // Make sure we're archiving at least 1 match
  if (!toArchive.length) {
    return null;
  }
  // Put the blob
  return playerArchive.archivePut(
    accountId.toString(),
    Buffer.from(JSON.stringify(toArchive)),
  );
  // TODO (howard) delete the archived values from player_caches
  // TODO (howard) keep the 20 highest match IDs for recentMatches
  // TODO (howard) mark the user archived so we don't need to query archive on every request
  // TODO (howard) add redis counts
}

/**
 * Archives old match blobs to s3 compatible storage and removes from blobstore
 * @param matchId
 * @returns The result of the archive operation
 */
export async function doArchiveFromLegacy(matchId: number) {
  if (!config.ENABLE_MATCH_ARCHIVE) {
    return;
  }
  let match = await getMatchDataFromLegacy(matchId);
  if (!match) {
    // We couldn't find this match so just skip it
    // console.log('could not find match:', matchId);
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
      // Just delete it from postgres and cassandra
      await db.raw('DELETE from parsed_matches WHERE match_id = ?', [
        Number(matchId),
      ]);
      await deleteFromLegacy(matchId);
    }
    return;
  }

  const blob = Buffer.from(
    JSON.stringify({ ...match, players: match.players || playerMatches }),
  );
  const result = await matchArchive.archivePut(matchId.toString(), blob);
  redisCount(redis, 'match_archive_write');
  if (result) {
    // Add to parsed_matches if not present
    await db.raw(
      'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
      [matchId],
    );
    // Mark the match archived
    await db.raw(
      `UPDATE parsed_matches SET is_archived = TRUE WHERE match_id = ?`,
      [matchId],
    );
    await deleteFromLegacy(matchId);
  }
  return result;
}

export async function doArchiveFromBlob(matchId: number) {
  if (!config.ENABLE_MATCH_ARCHIVE) {
    return;
  }
  // Don't backfill when determining whether to archive
  const [match, metadata] = await getMatchDataFromBlobWithMetadata(
    matchId,
    false,
  );
  if (!match) {
    // Invalid/not found, skip
    return;
  }
  if (metadata?.has_api && !metadata?.has_gcdata && !metadata?.has_parsed) {
    // if it only contains API data, delete the entire row
    await cassandra.execute(
      'DELETE from match_blobs WHERE match_id = ?',
      [matchId],
      {
        prepare: true,
      },
    );
    console.log('DELETE match %s, apionly', matchId);
    return;
  }
  if (metadata?.has_parsed) {
    // Archive the data since it's parsed. This might also contain api and gcdata
    const blob = Buffer.from(JSON.stringify(match));
    const result = await matchArchive.archivePut(matchId.toString(), blob);
    redisCount(redis, 'match_archive_write');
    if (result) {
      // Mark the match archived
      await db.raw(
        `UPDATE parsed_matches SET is_archived = TRUE WHERE match_id = ?`,
        [matchId],
      );
      // Delete the row (there might be gcdata, but we'll have it in the archive blob)
      // This will also also clear the gcdata cache for this match
      await cassandra.execute(
        'DELETE from match_blobs WHERE match_id = ?',
        [matchId],
        {
          prepare: true,
        },
      );
      console.log('ARCHIVE match %s, parsed', matchId);
    }
    return result;
  }
  // if it's something else, e.g. contains api and gcdata only, leave it for now
  console.log('SKIP match %s, other', matchId);
  return;
}

export async function deleteFromLegacy(id: number) {
  await Promise.all([
    cassandra.execute('DELETE from player_matches where match_id = ?', [id], {
      prepare: true,
    }),
    cassandra.execute('DELETE from matches where match_id = ?', [id], {
      prepare: true,
    }),
  ]);
}

export async function readArchivedPlayerMatches(
  accountId: number,
): Promise<ParsedPlayerMatch[]> {
  console.time('archive:' + accountId);
  const blob = await playerArchive.archiveGet(accountId.toString());
  const arr = blob ? JSON.parse(blob.toString()) : [];
  console.timeEnd('archive:' + accountId);
  return arr;
}

/**
 * Return parsed data by reading from the archive.
 * @param matchId
 * @returns
 */
export async function tryReadArchivedMatch(
  matchId: number,
): Promise<ParsedMatch | undefined> {
  try {
    if (!config.ENABLE_MATCH_ARCHIVE) {
      return;
    }
    // Check if the parsed data is archived
    // Most matches won't be in the archive so it's more efficient not to always try
    const isArchived = Boolean(
      (
        await db.raw(
          'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
          [matchId],
        )
      ).rows[0],
    );
    if (!isArchived) {
      return;
    }
    const blob = await matchArchive.archiveGet(matchId.toString());
    const result: ParsedMatch | null = blob
      ? JSON.parse(blob.toString())
      : null;
    if (result) {
      redisCount(redis, 'match_archive_read');
      return result;
    }
  } catch (e) {
    console.error(e);
  }
  return;
}
