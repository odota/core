var utility = require('./utility');
var async = require('async');
var db = require('./db');
var getData = utility.getData;
var operations = require('./operations');
var insertMatch = operations.insertMatch;
var constants = require('./constants.json');
var urllib = require('url');
var generateJob = utility.generateJob;
var config = require('./config');
var api_keys = config.STEAM_API_KEY.split(",");
var steam_hosts = config.STEAM_API_HOST.split(",");
var parallelism = Math.min(15*steam_hosts.length, api_keys.length);
module.exports = function processFullHistory(job, cb) {
    var player = job.data.payload;
    //if test or only want 500 of any hero, use the short array
    var heroArray = job.short_history || config.NODE_ENV === "test" ? ["0"] : Object.keys(constants.heroes);
    //use steamapi via specific player history and specific hero id (up to 500 games per hero)
    player.match_ids = {};
    async.eachLimit(heroArray, parallelism, function(hero_id, cb) {
        //make a request for every possible hero
        var container = generateJob("api_history", {
            account_id: player.account_id,
            hero_id: hero_id,
            matches_requested: 100
        });
        getApiMatchPage(player, container.url, function(err) {
            console.log("%s matches found", Object.keys(player.match_ids).length);
            cb(err);
        });
    }, function(err) {
        player.fh_unavailable = Boolean(err);
        if (err) {
            //non-retryable error while scanning, user had a private account
            console.log("error: %s", err);
            updatePlayer(null, player, cb);
        }
        else {
            //process this player's matches
            //convert hash to array
            var arr = [];
            for (var key in player.match_ids) {
                arr.push(Number(key));
            }
            db.matches.find({
                match_id: {
                    $in: arr
                }
            }, {
                fields: {
                    "match_id": 1
                }
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                console.log("%s matches found, %s already in db, %s to add", arr.length, docs.length, arr.length - docs.length);
                //iterate through db results, delete match_id key if exists
                for (var i = 0; i < docs.length; i++) {
                    var match_id = docs[i].match_id;
                    delete player.match_ids[match_id];
                }
                //iterate through keys, make api_details requests
                async.eachLimit(Object.keys(player.match_ids), parallelism, function(match_id, cb) {
                    //process api jobs directly with parallelism
                    var container = generateJob("api_details", {
                        match_id: Number(match_id)
                    });
                    getData(container.url, function(err, body) {
                        if (err) {
                            console.log(err);
                            //non-retryable error while getting a match?
                            //this shouldn't happen since all values are from api
                            //if it does, we just continue inserting matches
                            return cb();
                        }
                        var match = body.result;
                        //don't automatically parse full history reqs, mark them skipped
                        match.parse_status = 3;
                        insertMatch(match, function(err) {
                            cb(err);
                        });
                    });
                }, function(err) {
                    updatePlayer(err, player, cb);
                });
            });
        }
    });

    function updatePlayer(err, player, cb) {
        if (err) {
            return cb(err);
        }
        //done with this player, update
        db.players.update({
            account_id: player.account_id
        }, {
            $set: {
                full_history_time: new Date(),
                fh_unavailable: player.fh_unavailable
            }
        }, function(err) {
            console.log("got full match history for %s", player.account_id);
            cb(err);
        });
    }

    function getApiMatchPage(player, url, cb) {
        getData(url, function(err, body) {
            if (err) {
                //non-retryable error, probably the user's account is private
                console.log("non-retryable error");
                return cb(err);
            }
            //response for match history for single player
            var resp = body.result.matches;
            var start_id = 0;
            resp.forEach(function(match, i) {
                //add match ids on each page to match_ids
                var match_id = match.match_id;
                player.match_ids[match_id] = true;
                start_id = match.match_id;
            });
            var rem = body.result.results_remaining;
            if (rem === 0) {
                //no more pages
                cb(err);
            }
            else {
                //paginate through to max 500 games if necessary with start_at_match_id=
                var parse = urllib.parse(url, true);
                parse.query.start_at_match_id = (start_id - 1);
                parse.search = null;
                url = urllib.format(parse);
                getApiMatchPage(player, url, cb);
            }
        });
    }
}
