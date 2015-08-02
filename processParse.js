var db = require('./db');
var fs = require('fs');
var getReplayUrl = require('./getReplayUrl');
var request = require('request');
var domain = require('domain');
var constants = require('./constants.json');
var utility = require('./utility');
var updatePlayerCaches = require('./updatePlayerCaches');
var r = require('./redis');
var redis = r.client;
var moment = require('moment');
var config = require('./config');
module.exports = function processParse(job, ctx, cb) {
    var match_id = job.data.payload.match_id;
    var match = job.data.payload;
    console.time("parse " + match_id);
    //get the replay url, update db
    getReplayUrl(match, function(err) {
        if (err) {
            return cb(err);
        }
        //match object should now contain replay url, and should also be persisted to db
        if (match.start_time < moment().subtract(7, 'days').format('X') && !match.fileName) {
            //expired, can't parse even if we have url, but parseable if we have a filename
            //TODO jobs with filename (submitted via kue)  must be parsed by localhost (on master)!
            //TODO improve current request test: we have no url in db and replay is expired on socket request, so that request fails, but our current test doesn't verify the parse succeeded
            //TODO do we want to write parse_status:1 to db?  we should not overwrite existing parse_status:2
            console.log("replay too old, url expired");
            return cb(err);
        }
        else {
            runParse(job, ctx, function(err, parsed_data) {
                if (err) {
                    console.log("match_id %s, error %s", match_id, err);
                    return cb(err);
                }
                match.match_id = match_id || parsed_data.match_id;
                match.parsed_data = parsed_data;
                match.parse_status = 2;
                return updateDb();
            });
        }

        function updateDb() {
            //run aggregations on parsed data fields
            updatePlayerCaches(match, {
                type: "parsed"
            }, function(err) {
                console.timeEnd("parse " + match_id);
                return cb(err);
            });
        }
    });
};

function runParse(job, ctx, cb) {
    console.log("[PARSER] parsing from %s", job.data.payload.url || job.data.payload.fileName);
    var url = job.data.payload.url;
    var fileName = job.data.payload.fileName;
    var target = job.parser_url + "&url=" + url + "&fileName=" + (fileName ? fileName : "");
    console.log("target:%s", target);
    request({
        url: target
    }, function(err, resp, body) {
        if (err || resp.statusCode !== 200) {
            return cb(err || resp.statusCode || "http request error");
        }
        body = JSON.parse(body);
        return cb(body.error, body);
    });
}