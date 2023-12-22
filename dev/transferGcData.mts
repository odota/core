// Loop through matches table
// Fill in the cluster and replay_salt columns

const { db } = await import('../store/db.js');

const matches = (await db.raw(`select match_id from matches`)).rows;
for (let i = 0; i < matches.length; i++) {
  const gcdata = (
    await db.raw(
      'select match_id, cluster, replay_salt from match_gcdata where match_id = ?',
      [matches[i].match_id],
    )
  ).rows[0];
  console.log(gcdata);
  await db.raw(
    'update matches set cluster = ?, replay_salt = ? where match_id = ?',
    [gcdata.cluster, gcdata.replay_salt, gcdata.match_id],
  );
}
