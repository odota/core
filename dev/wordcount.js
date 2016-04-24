var JSONStream = require('JSONStream');
var db = require('../db');
var utility = require('../utility');
var compute = require('../compute');
var args = process.argv.slice(2);
var limit = Number(args[0]) || 1;
var stream = db.select('chat').from('matches').where('version', '>', '0').limit(limit).orderBy("match_id", "desc").stream();
var counts = {};
stream.on('end', function exit()
{
    console.log(JSON.stringify(counts));
    process.exit(0);
});
stream.pipe(JSONStream.parse());
stream.on('data', function(match)
{
    utility.mergeObjects(counts, compute.count_words(match));
});