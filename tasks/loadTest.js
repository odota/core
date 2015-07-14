var db = require('../db');
var async = require('async');
var request = require('request');

var host = "localhost:5000";

db.players.distinct("account_id",function(err, results){
    console.log(results.length);
    async.eachLimit(results, 10, function(account_id, cb){
        console.time(account_id);
        request("http://"+host+"/players/"+account_id, function(err, resp, body){
            console.timeEnd(account_id);
            cb(err);
        });
    }, function(err){
        console.log(err);
    });
});