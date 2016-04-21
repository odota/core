var utility = require('./utility');
var redis = require('./redis');
var queue = require('./queue');
var fhQueue = queue.getQueue('fullhistory');
var config = require('./config');
var async = require('async');
var db = require('./db');
var getData = utility.getData;
var queries = require('./queries');
var insertMatch = queries.insertMatch;
var constants = require('./constants.js');
var urllib = require('url');
var generateJob = utility.generateJob;
var api_keys = config.STEAM_API_KEY.split(",");
//number of api requests to send at once
var parallelism = Math.min(10, api_keys.length);

fhQueue.process(1, processFullHistory);

function processFullHistory(job, cb) {
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
            updatePlayer(player, cb);
        }
        else {
            //check what matches the player is already associated with
            db.select('match_id').from('player_matches').where({
                account_id: player.account_id
            }).
            asCallback(function(err, docs) {
                if (err) {
                    return cb(err);
                }
                console.log("%s matches found, %s already in db, %s to add", Object.keys(player.match_ids).length, docs.length, Object.keys(player.match_ids).length - docs.length);
                //iterate through db results, delete match_id key if this player has this match already
                //will re-request and update matches where this player was previously anonymous
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
                            return cb(err);
                        }
                        var match = body.result;
                        insertMatch(db, redis, match, {
                            type: "api",
                            skipAbilityUpgrades: true
                        }, cb);
                    });
                }, function(err) {
                    if (err) {
                        return cb(err);
                    }
                    updatePlayer(player, cb);
                });
            });
        }
    });

    function updatePlayer(player, cb) {
        //done with this player, update
        db('players').update({
            full_history_time: new Date(),
            fh_unavailable: player.fh_unavailable
        }).where({
            account_id: player.account_id
        }).asCallback(function(err) {
            if (err) {
                return cb(err);
            }
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
            //if !body.result, try again
            if (!body.result) {
                return getApiMatchPage(player, url, cb);
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
                return cb(err);
            }
            else {
                //paginate through to max 500 games if necessary with start_at_match_id=
                var parse = urllib.parse(url, true);
                parse.query.start_at_match_id = (start_id - 1);
                parse.search = null;
                url = urllib.format(parse);
                return getApiMatchPage(player, url, cb);
            }
        });
    }
}
