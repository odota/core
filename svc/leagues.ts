// Updates the list of leagues in the database
import db from '../store/db';
import { upsertPromise } from '../store/queries';
import {
  generateJob,
  getDataPromise,
  invokeInterval,
} from '../util/utility';

async function doLeagues(cb: ErrorCb) {
  const container = generateJob('api_leagues', {});
  try {
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
