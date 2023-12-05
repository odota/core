// Updates the list of leagues in the database
import utility from '../util/utility.mjs';
import db from '../store/db.mts';
import { upsertPromise } from '../store/queries.mjs';
const { invokeInterval, generateJob, getDataPromise } = utility;

async function doLeagues(cb: ErrorCb) {
  const container = generateJob('api_leagues', {});
  try {
    //@ts-ignore
    const apiLeagues = await getDataPromise(container.url);
    for (let i = 0; i < apiLeagues.length; i++) {
      const league = apiLeagues[i];
      const openQualifierTier =
        league.name.indexOf('Open Qualifier') === -1 ? null : 'excluded';
      let eventTier = 'excluded';
      if (league.tier === 2) {
        eventTier = 'professional';
      } else if (league.tier >= 3) {
        eventTier = 'premium';
      }
      if (league.league_id === 4664) {
        eventTier = 'premium';
      }
      league.tier = openQualifierTier || eventTier || null;
      league.ticket = null;
      league.banner = null;
      league.leagueid = league.league_id;
      //@ts-ignore
      await upsertPromise(db, 'leagues', league, {
        leagueid: league.league_id,
      });
    }
    cb();
  } catch (e) {
    cb(e);
  }
}
invokeInterval(doLeagues, 30 * 60 * 1000);
