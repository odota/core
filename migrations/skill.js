var db = require('../db');
var async = require('async');
var JSONStream = require('JSONStream');
var queries = require('../queries');
var insertMatchSkill = queries.insertMatchSkill;
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
//var end_id = Number(args[1]) || Number.MAX_VALUE;
//CREATE TABLE match_skill (match_id bigint,skill integer);
//alter table matches drop column skill;
var stream = db.select(['match_id', 'skill']).from('matches').where('match_id', '>=', start_id).whereNotNull("skill").orderBy("match_id", "asc").stream();
stream.on('end', done);
stream.pipe(JSONStream.parse());
stream.on('data', function(m) {
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