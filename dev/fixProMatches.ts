import db from '../svc/store/db.ts';
import { isProMatch } from '../svc/util/compute.ts';
import { getSteamAPIData, SteamAPIUrls } from '../svc/util/http.ts';
import { insertMatch } from '../svc/util/insert.ts';

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
  const body = await getSteamAPIData<MatchDetails>({
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
