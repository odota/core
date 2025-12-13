import db from "../svc/store/db.ts";
import { addReliableJob } from "../svc/store/queue.ts";

const { rows } = await db.raw(
  `select match_id, pgroup from rating_queue WHERE match_seq_num < 7094889566 ORDER BY match_seq_num ASC`,
);
for (let row of rows) {
  await addReliableJob(
    {
      name: "gcQueue",
      data: { match_id: row.match_id, pgroup: row.pgroup },
    },
    {
      priority: -1,
    },
  );
}
