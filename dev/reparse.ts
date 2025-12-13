// Issues reparse requests for all matches in postgres that aren't parsed
import db from "../svc/store/db.ts";
import { addReliableJob } from "../svc/store/queue.ts";

const matches = await db.raw(
  "select match_id from matches where replay_salt IS NULL",
);
console.log(matches.rows.length);
for (let input of matches.rows) {
  // match id request, get data from API
  await addReliableJob(
    { name: "parse", data: { match_id: input.match_id } },
    { priority: -3 },
  );
}
