// Cleans up old data from Cassandra and optionally archives it

async function start() {
  while (true) {
    try {
      // await archiveToken();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(e);
    }
  }
}
start();
