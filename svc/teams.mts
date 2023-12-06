// Updates the list of teams in the database
import db from '../store/db.mts';
import { upsertPromise } from '../store/queries.mts';
import { generateJob, getDataPromise } from '../util/utility.mts';

while (true) {
  console.time('doTeams');
  const result = await db.raw(
    'select distinct team_id from team_match order by team_id desc'
  );
  for (let i = 0; i < result.rows.length; i++) {
    const m = result.rows[i];
    if (!m.team_id) {
      continue;
    }
    // GetTeamInfo disabled as of october 2017
    /*
          const container = utility.generateJob('api_teams', {
            // 2 is the smallest team id, use as default
            team_id: m.team_id || 2,
          });
          */
    const container = generateJob('api_team_info_by_team_id', {
      start_at_team_id: m.team_id,
    });
    let body = await getDataPromise({
      url: container.url,
      raw: true,
    });
    const raw = body;
    body = JSON.parse(body);
    if (!body.result || !body.result.teams) {
      continue;
    }
    let t = body.result.teams[0];
    // The logo value is a 64 bit integer which is too large to represent in JSON
    // so need to read the raw response value
    // JSON.parse will return an incorrect value in the logo field
    const logoRegex = /^"logo":(.*),$/m;
    const match = logoRegex.exec(raw);
    const logoUgc = match?.[1];
    const ugcJob = generateJob('api_get_ugc_file_details', {
      ugcid: logoUgc,
    });
    const cdnJob = generateJob('steam_cdn_team_logos', {
      team_id: m.team_id,
    });
    // Steam's CDN sometimes has better versions of team logos available
    try {
      const cdnBody = await getDataPromise({
        url: cdnJob.url,
        noRetry: true,
      });
      if (cdnBody) {
        t.team_id = m.team_id;
        t.logo_url = cdnJob.url;
        // console.log('[TEAMS] cdn: ', t);
        await upsertPromise(db, 'teams', t, {
          team_id: m.team_id,
        });
        continue;
      }
    } catch {
      // This is fine, we failed to get CDN image info
      // Try getting image from ugc
      try {
        const ugcBody = await getDataPromise({
          url: ugcJob.url,
          noRetry: true,
        });
        t.team_id = m.team_id;
        if (ugcBody && ugcBody.data) {
          t.logo_url = ugcBody.data.url;
        }
        // console.log('[TEAMS] ugc: ', t);
        await upsertPromise(db, 'teams', t, {
          team_id: m.team_id,
        });
      } catch (e) {
        // Continue even if we can't get a logo
        console.log(e);
      }
    }
  }
  console.timeEnd('doTeams');
  await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
}
