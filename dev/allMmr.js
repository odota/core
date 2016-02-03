var db = require('../db');
var async = require('async');
var utility = require('../utility');
var generateJob = utility.generateJob;
var getData = utility.getData;
var queries = require('../queries');
var config = require('../config');
var retrieverArr = config.RETRIEVER_HOST.split(",");
var count = 0;
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
db.select('account_id').from('players').where('account_id', '>', start_id).orderByRaw(start_id ? 'account_id asc' : 'random()').asCallback(function(err, players) {
    if (err) {
        process.exit(1);
    }
    async.eachLimit(players, 5, function(p, cb) {
        var job = {
            data: generateJob("mmr", {
                account_id: p.account_id,
                url: retrieverArr.map(function(r) {
                    return "http://" + r + "?key=" + config.RETRIEVER_SECRET + "&account_id=" + p.account_id;
                })[p.account_id % retrieverArr.length]
            })
        };
        getData({
            url: job.data.url,
            noRetry: true
        }, function(err, data) {
            if (err) {
                console.error(err);
            }
            count += 1;
            console.log(count, p.account_id);
            if (data && (data.solo_competitive_rank || data.competitive_rank)) {
                console.log(data);
                data.account_id = job.data.payload.account_id;
                data.match_id = job.data.payload.match_id;
                data.time = new Date();
                queries.insertPlayerRating(db, data, cb);
            }
            else {
                cb();
            }
        });
    }, function(err) {
        console.log(err);
        process.exit(Number(err));
    });
});
