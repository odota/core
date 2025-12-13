// Updates the list of teams in the database
import axios from "axios";
import db, { upsert } from "./store/db.ts";
import { runInLoop } from "./util/utility.ts";
import JSONbig from "json-bigint";
import {
  SteamAPIUrls,
  getSteamAPIDataWithRetry,
  getSteamAPIData,
} from "./util/http.ts";

runInLoop(
  async function doTeams() {
    const result = await db.raw(
      "select distinct team_id from team_match TABLESAMPLE BERNOULLI(0.05)",
    );
    const result2 = await db.raw(
      "select team_id from (select distinct team_id from team_match) ids where team_id not in (select team_id from teams)",
    );
    const combined = [...result2.rows, ...result.rows];
    for (let m of combined) {
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
      let raw = await getSteamAPIDataWithRetry<string>({
        url,
        raw: true,
      });
      const body = JSONbig.parse(raw);
      if (!body.result || !body.result.teams) {
        continue;
      }
      let t = body.result.teams[0];
      t.team_id = m.team_id;
      // Steam's CDN sometimes has better versions of team logos available
      try {
        const cdnUrl = `https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/${m.team_id}.png`;
        // Check if it exists
        await axios.head(cdnUrl);
        t.logo_url = cdnUrl;
        // console.log('[TEAMS] cdn: ', t);
      } catch {
        // This is fine, we failed to get CDN image info
        console.log("failed to get image from cdn");
      }
      if (!t.logo_url) {
        // The logo value is a 64 bit integer which is too large to represent in JSON
        // So we use JSONbig to parse it
        const logoUgc = t.logo;
        // Try getting image from ugc
        try {
          const ugcUrl = SteamAPIUrls.api_get_ugc_file_details({
            ugcid: logoUgc,
          });
          // This may not exist for all teams so don't retry
          const ugcBody = await getSteamAPIData<any>({
            url: ugcUrl,
          });
          if (ugcBody && ugcBody.data) {
            t.logo_url = ugcBody.data.url;
          }
          // console.log('[TEAMS] ugc: ', t);
        } catch (e) {
          // Continue even if we can't get a logo
          console.log("failed to get image from ugc");
        }
      }
      await upsert(db, "teams", t, {
        team_id: m.team_id,
      });
    }
  },
  30 * 60 * 1000,
);
