// Builds sets of data, e.g. tracked players in the background
import { cacheTrackedPlayers } from "./util/queries.ts";
import { runInLoop } from "./store/queue.ts";

await runInLoop(async function buildSets() {
  await cacheTrackedPlayers();
}, 60 * 1000);
