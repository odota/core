// Cleans up old data from Cassandra and optionally archives it

import { runInLoop } from "./util/utility.ts";

runInLoop(async function archive() {
  // archiveToken();
}, 1000);
