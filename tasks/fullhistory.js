var utility = require('../utility');
var db = require('../db');
var async = require('async');
var queueReq = require('../operations').queueReq;
var getData = utility.getData;
var urllib = require('url');
var generateJob = utility.generateJob;
var selector = require('../selector');
var constants = require('../sources.json');

module.exports = function getFullMatchHistory(heroes, done) {
    var heroArray = Object.keys(constants.heroes);
    if (typeof heroes === "object") {
        heroArray = heroes;
    }
    else {
        done = heroes;
    }
    var match_ids = {};
    db.players.find(selector("fullhistory"), {
        limit: 1,
        sort: {
            full_history_time: 1
        }
    }, function(err, players) {
        if (err) {
            return done(err);
        }
        //find all the matches to add to kue
        async.mapSeries(players, getHistoryByHero, function(err) {
            if (err) {
                return done(err);
            }
            //convert hash to array
            var arr = [];
            for (var key in match_ids) {
                arr.push(key);
            }
            //add the jobs to kue
            async.mapSeries(arr, function(match_id, cb) {
                var match = {
                    match_id: Number(match_id)
                };
                db.matches.find(match, function(err, docs) {
                    if (!err && docs.length) {
                        queueReq("api_details", match, function(err) {
                            //added a single job to kue
                            cb(err);
                        });
                    }
                    else {
                        cb(err);
                    }
                });
            }, function(err) {
                if (err) {
                    return done(err);
                }
                //added all the matches to kue
                async.mapSeries(players, function(player, cb) {
                    db.players.update({
                        account_id: player.account_id
                    }, {
                        $set: {
                            full_history_time: new Date()
                        }
                    }, function(err) {
                        console.log("got full match history for %s", player.account_id);
                        cb(err);
                    });
                }, function(err) {
                    done(err);
                });
            });
        });
    });

    function getApiMatchPage(url, cb) {
        getData(url, function(err, body) {
            if (err) {
                //retry
                return getApiMatchPage(url, cb);
            }
            //response for match history for single player
            var resp = body.result.matches;
            var start_id = 0;
            resp.forEach(function(match, i) {
                //add match ids on each page to match_ids
                var match_id = match.match_id;
                match_ids[match_id] = true;
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

    function getHistoryByHero(player, cb) {
        //use steamapi via specific player history and specific hero id (up to 500 games per hero)
        async.mapSeries(heroArray, function(hero_id, cb) {
            //make a request for every possible hero
            var container = generateJob("api_history", {
                account_id: player.account_id,
                hero_id: hero_id,
                matches_requested: 100
            });
            getApiMatchPage(container.url, function(err) {
                console.log("%s matches found", Object.keys(match_ids).length);
                cb(err);
            });
        }, function(err) {
            //done with this player
            cb(err);
        });
    }
};