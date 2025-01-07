import { PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { playerArchive } from '../store/archive';
import { getFullPlayerMatchesWithMetadata } from '../util/buildPlayer';
import { PlayerFetcher } from './base';

async function doArchivePlayerMatches(
  accountId: number,
): Promise<PutObjectCommandOutput | null> {
  if (!playerArchive) {
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

async function readArchivedPlayerMatches(
  accountId: number,
): Promise<ParsedPlayerMatch[]> {
  if (!playerArchive) {
    return [];
  }
  console.time('archive:' + accountId);
  const blob = await playerArchive.archiveGet(accountId.toString());
  const arr = blob ? JSON.parse(blob.toString()) : [];
  console.timeEnd('archive:' + accountId);
  return arr;
}

class PlayerArchiveFetcher extends PlayerFetcher<ParsedPlayerMatch[]> {
  readData = readArchivedPlayerMatches;
  getOrFetchData = async (accountId: number) => {
    await doArchivePlayerMatches(accountId);
    return this.readData(accountId);
  };
}

export const playerArchiveFetcher = new PlayerArchiveFetcher();