// Updates the list of teams in the database
import axios from 'axios';
import db from '../store/db';
import { upsert } from '../util/insert';
import {
  SteamAPIUrls,
  getSteamAPIData,
  invokeIntervalAsync,
} from '../util/utility';

async function doTeams() {
  const result = await db.raw(
    'select distinct team_id from team_match TABLESAMPLE SYSTEM_ROWS(1000)',
  );
  for (let i = 0; i < result.rows.length; i++) {
    const m = result.rows[i];
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
    let body;
    try {
      body = await getSteamAPIData({
        url,
        raw: true,
      });
    } catch (err) {
      // Just move on if we failed due to transient error (will retry on next iteration)
      continue;
    }
    const raw = body;
    body = JSON.parse(body);
    if (!body.result || !body.result.teams) {
      continue;
    }
    let t = body.result.teams[0];
    // The logo value is a 64 bit integer which is too large to represent in JSON
    // so need to read the raw response value
    // JSON.parse will return an incorrect value in the logo field
    // Maybe can use JSONbig here?
    const logoRegex = /^"logo":(.*),$/m;
    const match = logoRegex.exec(raw);
    const logoUgc = match?.[1];
    const ugcUrl = SteamAPIUrls.api_get_ugc_file_details({
      ugcid: logoUgc,
    });
    // Steam's CDN sometimes has better versions of team logos available
    try {
      const cdnUrl = `https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/${m.team_id}.png`;
      // Check if it exists
      await axios.head(cdnUrl);
      t.team_id = m.team_id;
      t.logo_url = cdnUrl;
      // console.log('[TEAMS] cdn: ', t);
      await upsert(db, 'teams', t, {
        team_id: m.team_id,
      });
      continue;
    } catch {
      // This is fine, we failed to get CDN image info
      // Try getting image from ugc
      try {
        const ugcBody = await getSteamAPIData({
          url: ugcUrl,
        });
        t.team_id = m.team_id;
        if (ugcBody && ugcBody.data) {
          t.logo_url = ugcBody.data.url;
        }
        // console.log('[TEAMS] ugc: ', t);
        await upsert(db, 'teams', t, {
          team_id: m.team_id,
        });
      } catch (e) {
        // Continue even if we can't get a logo
        console.log(e);
      }
    }
  }
}
invokeIntervalAsync(doTeams, 60 * 60 * 1000);
