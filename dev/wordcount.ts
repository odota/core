import db from '../svc/store/db';
import { countWords } from '../svc/util/compute';
import { mergeObjects } from '../svc/util/utility';

const args = process.argv.slice(2);
const limit = Number(args[0]) || 1;
const stream = db
  .select('chat')
  .from('matches')
  .where('version', '>', '0')
  .limit(limit)
  .orderBy('match_id', 'desc')
  .stream();
const counts = {};
stream.on('end', () => {
  console.log(JSON.stringify(counts));
  process.exit(0);
});
stream.on('data', (match) => {
  mergeObjects(counts, countWords(match, null));
});
