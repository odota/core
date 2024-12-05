import config from '../config';
import { Archive } from '../store/archive';

const playerArchive = config.ENABLE_PLAYER_ARCHIVE
  ? new Archive('player')
  : null;

export async function readArchivedPlayerMatches(
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