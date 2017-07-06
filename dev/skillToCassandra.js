const db = require('../store/db');
const JSONStream = require('JSONStream');
const queries = require('../store/queries');

const insertMatchSkillCassandra = queries.insertMatchSkillCassandra;
const args = process.argv.slice(2);
const startId = Number(args[0]) || 0;
// var end_id = Number(args[1]) || Number.MAX_VALUE;

function done(err) {
  if (err) {
    console.error(err);
  }
  console.log('done!');
  process.exit(Number(err));
}

const stream = db.select().from('match_skill').where('match_id', '>=', startId)
  .orderBy('match_id', 'asc')
  .stream();
stream.on('end', done);
stream.pipe(JSONStream.parse());
stream.on('data', (m) => {
  stream.pause();
  insertMatchSkillCassandra(m, (err) => {
    if (err) {
      throw err;
    }
    console.log(m.match_id);
    return stream.resume();
  });
});
