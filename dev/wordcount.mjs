import JSONStream from 'JSONStream';
import db from '../store/db';
import utility from '../util/utility.js';
import compute from '../util/compute.js';

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
stream.pipe(JSONStream.parse());
stream.on('data', (match) => {
  utility.mergeObjects(counts, compute.count_words(match));
});
