import { patch } from 'dotaconstants';
import db from '../store/db';
import { upsert } from '../store/insert';
import { getPatchIndex } from '../util/utility';

async function start() {
  // No loop, just runs once when deployed
  const matches = await db.select(['match_id', 'start_time']).from('matches');
  // This could be a lot of matches so go one at a time
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    await upsert(
      db,
      'match_patch',
      {
        match_id: match.match_id,
        patch: patch[getPatchIndex(match.start_time)].name,
      },
      {
        match_id: match.match_id,
      },
    );
  }
}
start();
