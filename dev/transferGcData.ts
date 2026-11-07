// Loop through matches table
// Fill in the cluster and replay_salt columns
import db from "../svc/store/db.ts";

const matches = (
  await db.query(
    `select match_id from matches where (cluster is null OR replay_salt is null)`,
  )
).rows;
for (let match of matches) {
  const gcdata = (
    await db.query(
      "select match_id, cluster, replay_salt from match_gcdata where match_id = $1",
      [match.match_id],
    )
  ).rows[0];
  console.log(gcdata);
  if (gcdata) {
    await db.query(
      "update matches set cluster = $1, replay_salt = $2 where match_id = $3",
      [gcdata.cluster, gcdata.replay_salt, gcdata.match_id],
    );
  }
}
