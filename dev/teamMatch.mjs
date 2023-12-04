import db from '../store/db.mjs';
import { upsertPromise } from '../store/queries.mjs';

db.select(['radiant_team_id', 'dire_team_id', 'match_id'])
  .from('matches')
  .asCallback((err, matches) => {
    if (err) {
      throw err;
    }
    matches.forEach((match) => {
      console.log(match.match_id);
      const arr = [];
      if (match.radiant_team_id) {
        arr.push({
          team_id: match.radiant_team_id,
          match_id: match.match_id,
          radiant: true,
        });
      }
      if (match.dire_team_id) {
        arr.push({
          team_id: match.dire_team_id,
          match_id: match.match_id,
          radiant: false,
        });
      }
      arr.forEach(async (tm) => {
        await upsertPromise(db, 'team_match', tm, {
          team_id: tm.team_id,
          match_id: tm.match_id,
        });
      });
    });
  });
