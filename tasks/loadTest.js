var db = require('../db');
var async = require('async');
var request = require('request');

db.players.distinct("account_id",function(err, results){
    console.log(results.length);
    async.eachLimit(results, 40, function(account_id, cb){
        console.time(account_id);
        request("http://localhost:5000/players/"+account_id, function(err, resp, body){
            console.timeEnd(account_id);
            cb(err);
        });
    }, function(err){
        console.log(err);
    })
})