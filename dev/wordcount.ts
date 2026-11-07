import QueryStream from "pg-query-stream";
import db from "../svc/store/db.ts";
import { countWords } from "../svc/util/compute.ts";
import { mergeObjects } from "../svc/util/utility.ts";

const args = process.argv.slice(2);
const limit = Number(args[0]) || 1;
const client = await db.connect();
const stream = client.query(
  new QueryStream(
    "SELECT chat FROM matches WHERE version > 0 ORDER BY match_id DESC LIMIT $1",
    [limit],
  ),
);
const counts = {};
stream.on("end", () => {
  client.release();
  console.log(JSON.stringify(counts));
  process.exit(0);
});
stream.on("data", (match) => {
  mergeObjects(counts, countWords(match, null));
});
