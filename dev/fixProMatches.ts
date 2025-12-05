const { insertMatch } = await import('../svc/util/insert.ts');
const { db } = await import('../svc/store/db.ts');
const { SteamAPIUrls, getSteamAPIData, isProMatch } =
  await import('../svc/util/utility.ts');

// From DB
const { rows } = await db.raw(
  `select distinct match_id from player_matches where hero_id is null`,
);
for (let i = 0; i < rows.length; i++) {
  const match = rows[i];
  console.log(match.match_id);
  const url = SteamAPIUrls.api_details({
    match_id: match.match_id,
  });
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
