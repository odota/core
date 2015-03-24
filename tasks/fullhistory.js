var utility = require('../utility');
var db = require('../db');
var async = require('async');
var getData = utility.getData;
var urllib = require('url');
var generateJob = utility.generateJob;
var constants = require('../sources.json');
var config = require('../config');
var api_keys = config.STEAM_API_KEY.split(",");
var operations = require('../operations');
var insertMatch = operations.insertMatch;
module.exports = function getFullMatchHistory(done, heroArray) {
    //todo do only players who dont have a full history yet?
    //we might want to re-scan histories, but not at the cost of delaying it for new users
    heroArray = heroArray || Object.keys(constants.heroes);
    db.players.find({
        last_visited: {
            $ne: null
        }
    }, {
        sort: {
            full_history_time: 1,
            join_date: 1
        }
    }, function(err, players) {
        if (err) {
            return done(err);
        }
        async.eachSeries(players, getHistoryByHero, function(err) {
            return done(err);
        });
    });

    function getHistoryByHero(player, cb) {
        //use steamapi via specific player history and specific hero id (up to 500 games per hero)
        player.match_ids = {};
        async.eachLimit(heroArray, api_keys.length, function(hero_id, cb) {
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
                    $in: arr
                }, {
                    fields: {
                        "match_id": 1
                    }
                }, function(err, docs) {
                    if (err) {
                        return cb(err);
                    }
                    console.log("%s matches found, %s already in db, %s to add", arr.length, docs.length, arr.length-docs.length);
                    //iterate through db results, delete match_id key if exists
                    for (var i = 0; i < docs.length; i++) {
                        var match_id = docs[i].match_id;
                        delete player.match_ids[match_id];
                    }
                    //iterate through keys, make api_details requests
                    async.eachLimit(Object.keys(player.match_ids), api_keys.length, function(match_id, cb) {
                        //process api jobs directly with parallelism
                        var container = generateJob("api_details", {
                            match_id: Number(match_id)
                        });
                        getData(container.url, function(err, body) {
                            if (err) {
                                //non-retryable error while getting a match?
                                //this shouldn't happen since all values are from api
                                //if it does, we just continue inserting matches
                                return cb();
                            }
                            var match = body.result;
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
    }

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
                getApiMatchPage(url, cb);
            }
        });
    }
};
