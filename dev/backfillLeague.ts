// Backfill matches for leagues (including amateur) from GetMatchHistory using:
// https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/v1/?key=X&league_id=17211
// Can fetch up to 500 matches per league
// We might have more than 500 in some pro leagues? can query existing matches table for that
import db from '../svc/store/db.ts';
import { getSteamAPIDataWithRetry, SteamAPIUrls } from '../svc/util/utility.ts';

// Backfill from steam API
let { rows } = await db.raw('select leagueid from leagues WHERE leagueid > 0 ORDER by leagueid ASC');
for (let i = 0; i < rows.length; i++) {
    const leagueid = rows[i].leagueid;
    // Get a page of matches
    let nextPage = true;
    let start_at_match_id = undefined;
    while (nextPage) {
        const url = SteamAPIUrls.api_history({leagueid, matches_requested: 100, start_at_match_id });
        const data = await getSteamAPIDataWithRetry({ url });
        for (let j = 0; j < data.result.matches.length; j++) {
            const match = data.result.matches[j];
            console.log(leagueid, match.match_id);
            await db.raw('INSERT INTO league_match(leagueid, match_id) VALUES(?, ?) ON CONFLICT DO NOTHING', [leagueid, match.match_id]);
        }
        nextPage = data.result.results_remaining > 0;
        start_at_match_id = data.result.matches.slice(-1)?.[0]?.match_id - 1;
    }
}

// Backfill from existing table
let { rows: rows2 } = await db.raw('select leagueid, match_id from matches ORDER by match_id ASC');
for (let j = 0; j < rows2.length; j++) {
    const {leagueid, match_id } = rows2[j];
    console.log(leagueid, match_id);
    await db.raw('INSERT INTO league_match(leagueid, match_id) VALUES(?, ?) ON CONFLICT DO NOTHING', [leagueid, match_id]);
}
