const db = require('../db');
const async = require('async');
const JSONStream = require('JSONStream');
const queries = require('../queries');
const insertMatchSkill = queries.insertMatchSkill;
const args = process.argv.slice(2);
const start_id = Number(args[0]) || 0;
// var end_id = Number(args[1]) || Number.MAX_VALUE;
// CREATE TABLE match_skill (match_id bigint,skill integer);
// alter table matches drop column skill;
const stream = db.select(['match_id', 'skill']).from('matches').where('match_id', '>=', start_id).whereNotNull('skill').orderBy('match_id', 'asc').stream();
stream.on('end', done);
stream.pipe(JSONStream.parse());
stream.on('data', (m) => {
  stream.pause();
  insertMatchSkill(db, m, cb);

  function cb(err) {
    if (err) {
      return done(err);
    }
    console.log(m.match_id);
    stream.resume();
  }
});

function done(err) {
  if (err) {
    console.error(err);
  }
  console.log('done!');
  process.exit(Number(err));
}
