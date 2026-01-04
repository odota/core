// Cleans up old data from Cassandra and optionally archives it
import { runInLoop } from "./store/queue.ts";

await runInLoop(async function archive() {
  // archiveToken();
}, 1000);
