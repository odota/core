// Cleans up old data from Cassandra and optionally archives it
import { archivePostgresStream, getCurrentMaxArchiveID } from '../store/getArchivedData';

async function start() {
  const max = await getCurrentMaxArchiveID();
  // Delete/archive a random page of matches (maybe unparsed)
  while (true) {
    try {
      // await archivePostgresStream(max);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(e);
    }
  }
}
start();
