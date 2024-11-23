// Cleans up old data from Cassandra and optionally archives it
import {
  archivePostgresStream,
} from '../util/archiveUtil';

async function start() {
  // const max = await getCurrentMaxArchiveID();
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
