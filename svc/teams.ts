// Updates the list of teams in the database
import axios from 'axios';
import db, { upsert } from './store/db.ts';
import {
  SteamAPIUrls,
  getSteamAPIData,
  getSteamAPIDataWithRetry,
  runInLoop,
} from './util/utility.ts';

runInLoop(
  async function doTeams() {
    const result = await db.raw(
      'select distinct team_id from team_match TABLESAMPLE SYSTEM_ROWS(1000)',
    );
    const result2 = await db.raw(
      'select team_id from (select distinct team_id from team_match) ids where team_id not in (select team_id from teams)',
    );
    const combined = [...result2.rows, ...result.rows];
    for (let i = 0; i < combined.length; i++) {
      const m = combined[i];
      if (!m.team_id) {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // GetTeamInfo disabled as of october 2017
      /*
    const url = SteamAPIUrls.api_teams({
      // 2 is the smallest team id, use as default
      team_id: m.team_id || 2,
    });
    */
      const url = SteamAPIUrls.api_team_info_by_team_id({
        start_at_team_id: m.team_id,
      });
      let body = await getSteamAPIDataWithRetry({
        url,
        raw: true,
      });
      const raw = body;
      body = JSON.parse(body);
      if (!body.result || !body.result.teams) {
        continue;
      }
      let t = body.result.teams[0];
      t.team_id = m.team_id;
      // The logo value is a 64 bit integer which is too large to represent in JSON
      // so need to read the raw response value
      // JSON.parse will return an incorrect value in the logo field
      // Maybe can use JSONbig here?
      const logoRegex = /^"logo":(.*),$/m;
      const match = logoRegex.exec(raw);
      const logoUgc = match?.[1];
      // Steam's CDN sometimes has better versions of team logos available
      try {
        const cdnUrl = `https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/${m.team_id}.png`;
        // Check if it exists
        await axios.head(cdnUrl);
        t.logo_url = cdnUrl;
        // console.log('[TEAMS] cdn: ', t);
      } catch {
        // This is fine, we failed to get CDN image info
        console.log('failed to get image from cdn');
      }
      if (!t.logo_url) {
        // Try getting image from ugc
        try {
          const ugcUrl = SteamAPIUrls.api_get_ugc_file_details({
            ugcid: logoUgc,
          });
          // This may not exist for all teams so don't retry
          const ugcBody = await getSteamAPIData({
            url: ugcUrl,
          });
          if (ugcBody && ugcBody.data) {
            t.logo_url = ugcBody.data.url;
          }
          // console.log('[TEAMS] ugc: ', t);
        } catch (e) {
          // Continue even if we can't get a logo
          console.log('failed to get image from ugc');
        }
      }
      await upsert(db, 'teams', t, {
        team_id: m.team_id,
      });
    }
  },
  60 * 60 * 1000,
);
