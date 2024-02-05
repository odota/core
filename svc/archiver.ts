// Cleans up old data from Cassandra and optionally archives it
import { archiveToken, getCurrentMaxArchiveID } from '../store/getArchivedData';

async function start() {
  const max = await getCurrentMaxArchiveID();
  // Delete/archive a random page of matches (maybe unparsed)
  while (true) {
    try {
      await archiveToken(max);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(e);
    }
  }
}
start();
