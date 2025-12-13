// Cleans up old data from the database (originally used for scenarios but now also does other cleanup)
import db from "./store/db.ts";
import config from "../config.ts";
import { epochWeek, runInLoop } from "./util/utility.ts";
import fs from "node:fs/promises";
import { isRecentVisitor, isRecentlyVisited } from "./util/queries.ts";

runInLoop(
  async function cleanup() {
    const currentWeek = epochWeek();
    await db("team_scenarios")
      .whereNull("epoch_week")
      .orWhere(
        "epoch_week",
        "<=",
        currentWeek - Number(config.MAXIMUM_AGE_SCENARIOS_ROWS),
      )
      .del();
    await db("scenarios")
      .whereNull("epoch_week")
      .orWhere(
        "epoch_week",
        "<=",
        currentWeek - Number(config.MAXIMUM_AGE_SCENARIOS_ROWS),
      )
      .del();
    await db.raw(
      "DELETE from public_matches where start_time < extract(epoch from now() - interval '12 month')::int",
    );
    await db.raw(
      "DELETE from last_seq_num where match_seq_num < (select max(match_seq_num) from last_seq_num)",
    );
    let files: string[] = [];
    try {
      files = await fs.readdir("./cache");
    } catch (e) {
      // ignore if doesn't exist
    }
    for (let file of files) {
      try {
        // Check if the ID is of a recent visitor or recently visited profile, if so, don't delete
        const isVisitor = await isRecentVisitor(Number(file));
        const isVisited = await isRecentlyVisited(Number(file));
        if (!isVisited && !isVisitor) {
          await fs.unlink("./cache/" + file);
        }
      } catch (e) {
        console.log(e);
      }
    }
    return;
  },
  3 * 60 * 60 * 1000,
);
