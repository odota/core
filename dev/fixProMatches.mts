const { insertMatch } = await import('../util/insert.js');
const { db } = await import('../store/db.js');
const { generateJob, getSteamAPIData, isProMatch } = await import(
  '../util/utility.js'
);

// From DB
const { rows } = await db.raw(
  `select distinct match_id from player_matches where hero_id is null`,
);
for (let i = 0; i < rows.length; i++) {
  const match = rows[i];
  console.log(match.match_id);
  const job = generateJob('api_details', {
    match_id: match.match_id,
  });
  const { url } = job;
  const body: any = await getSteamAPIData({
    url,
  });
  if (body.result) {
    const match = body.result;
    if (!isProMatch(match)) {
      await db.raw('DELETE FROM matches WHERE match_id = ?', [match.match_id]);
    } else {
      await insertMatch(match, { type: 'api' });
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
