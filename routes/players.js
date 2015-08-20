var express = require('express');
var players = express.Router();
var async = require('async');
var config = require('../config');
var constants = require('../constants.json');
var queries = require("../queries");
var fillPlayerData = require('../fillPlayerData');
var db = require('../db');
players.get('/:account_id/:info?', function(req, res, next) {
    var playerPages = {
        "index": {
            "name": "Overview"
        },
        "matches": {
            "name": "Matches"
        },
        "histograms": {
            "name": "Histograms"
        },
        "records": {
            "name": "Records"
        },
        "activity": {
            "name": "Activity"
        },
        "counts": {
            "name": "Counts"
        },
        "totals": {
            "name": "Totals"
        },
        "items": {
            "name": "Items"
        },
        "skills": {
            "name": "Skills"
        },
        "wordcloud": {
            "name": "Word Cloud"
        },
        "compare": {
            "name": "Compare"
        },
        "rating": {
            "name": "Rating"
        }
    };
    console.time("player " + req.params.account_id);
    var info = playerPages[req.params.info] ? req.params.info : "index";
    var compare_data;
    var histograms = {
        "duration": 1,
        "first_blood_time": 1,
        "level": 1,
        "kills": 1,
        "deaths": 1,
        "assists": 1,
        "kda": 1,
        "last_hits": 1,
        "denies": 1,
        "hero_damage": 1,
        "tower_damage": 1,
        "hero_healing": 1,
        "gold_per_min": 1,
        "xp_per_min": 1,
        "stuns": 1,
        "tower_kills": 1,
        "neutral_kills": 1,
        "courier_kills": 1,
        "tps_purchased": 1,
        "observers_purchased": 1,
        "sentries_purchased": 1,
        "gems_purchased": 1,
        "rapiers_purchased": 1,
        "pings": 1,
        "pick_order": 1,
        "throw": 1,
        "comeback": 1,
        "stomp": 1,
        "loss": 1
    };
    //copy the query in case we need the original for compare passing
    var qCopy = JSON.parse(JSON.stringify(req.query));
    async.series({
        "player": function(cb) {
            fillPlayerData(req.params.account_id, {
                info: info,
                query: {
                    select: req.query
                }
            }, cb);
        },
        "sets": function(cb) {
            queries.getSets(function(err, results) {
                cb(err, results);
            });
        }
    }, function(err, result) {
        if (err) {
            return next(err);
        }
        var player = result.player;
        var aggData = player.aggData;
        async.parallel({
            //the array of teammates under the filter condition
            teammate_list: function(cb) {
                generateTeammateArray(aggData.teammates, player, cb);
            },
            //the array of teammates cached (no filter)
            all_teammate_list: function(cb) {
                generateTeammateArray(player.all_teammates, player, cb);
            }
        }, function(err, lists) {
            if (err) {
                return next(err);
            }
            player.teammate_list = lists.teammate_list;
            var teammate_ids = lists.all_teammate_list || [];
            //add custom tagged elements to teammate_ids, but ensure there are no duplicates.
            var ids = {};
            teammate_ids.forEach(function(t) {
                ids[t.account_id] = 1;
            });
            for (var key in req.query) {
                if (key.indexOf("account_id") !== -1 && req.query[key].constructor === Array) {
                    req.query[key].forEach(function(id) {
                        //iterate through array
                        //check for duplicates
                        //append to teammate_ids
                        if (!ids[id]) {
                            teammate_ids.unshift({
                                account_id: Number(id),
                                personaname: id
                            });
                        }
                        ids[id] = 1;
                    });
                }
            }
            //sort ratings by time
            player.ratings = player.ratings || [];
            player.ratings.sort(function(a, b) {
                return new Date(a.time) - new Date(b.time);
            });
            //compute abandons
            player.abandons = 0;
            for (var key in player.aggData.leaver_status.counts) {
                if (Number(key) >= 2) {
                    player.abandons += player.aggData.leaver_status.counts[key];
                }
            }
            var ratings = player.ratings;
            player.soloRating = ratings[0] ? ratings[ratings.length - 1].soloCompetitiveRank : null;
            player.partyRating = ratings[0] ? ratings[ratings.length - 1].competitiveRank : null;
            if (info === "compare") {
                var account_ids = ["all", req.params.account_id.toString()];
                var compareIds = req.query.compare_account_id;
                compareIds = compareIds ? [].concat(compareIds) : [];
                account_ids = account_ids.concat(compareIds).slice(0, 6);
                async.map(account_ids, function(account_id, cb) {
                    //pass a copy of the original query
                    fillPlayerData(account_id, {
                        query: {
                            select: JSON.parse(JSON.stringify(qCopy))
                        }
                    }, function(err, player) {
                        console.log("computing averages %s", player.account_id);
                        //create array of results.aggData for each account_id
                        for (var key in histograms) {
                            /*
                            //mean
                            if (player.aggData[key].sum && player.aggData[key].n) {
                                player.aggData[key].avg = player.aggData[key].sum / player.aggData[key].n;
                            }
                            */
                            //median
                            var arr = [];
                            for (var value in player.aggData[key].counts) {
                                for (var i = 0; i < player.aggData[key].counts[value]; i++) {
                                    arr.push(Number(value));
                                }
                            }
                            arr.sort(function(a, b) {
                                return a - b;
                            });
                            player.aggData[key].avg = arr[Math.floor(arr.length / 2)];
                        }
                        cb(err, player);
                    });
                }, function(err, results) {
                    if (err) {
                        return next(err);
                    }
                    console.time("computing percentiles");
                    //compute percentile for each stat
                    //for each stat average in each player's aggdata, iterate through all's stat counts and determine whether this average is gt/lt key, then add count to appropriate bucket. percentile is gt/(gt+lt)
                    results.forEach(function(r, i) {
                        for (var key in histograms) {
                            var avg = results[i].aggData[key].avg;
                            var allCounts = results[0].aggData[key].counts;
                            var gt = 0;
                            var total = 0;
                            for (var value in allCounts) {
                                var valueCount = allCounts[value];
                                if (avg >= Number(value)) {
                                    gt += valueCount;
                                }
                                total += valueCount;
                            }
                            results[i].aggData[key].percentile = total ? (gt / total) : 0;
                        }
                    });
                    console.timeEnd("computing percentiles");
                    compare_data = results;
                    render();
                });
            }
            /*
            else if (info === "rating") {
                console.time("computing ratings");
                db.players.find({
                    "ratings": {
                        $ne: null
                    }
                }, function(err, docs) {
                    if (err) {
                        return next(err);
                    }
                    docs.forEach(function(d) {
                        d.soloCompetitiveRank = d.ratings[d.ratings.length - 1].soloCompetitiveRank;
                        d.competitiveRank = d.ratings[d.ratings.length - 1].competitiveRank;
                        d.time = d.ratings[d.ratings.length - 1].time;
                    });
                    var soloRatings = docs.filter(function(d) {
                        return d.soloCompetitiveRank;
                    });
                    soloRatings.sort(function(a, b) {
                        return b.soloCompetitiveRank - a.soloCompetitiveRank;
                    });
                    for (var i = 0; i < soloRatings.length; i++) {
                        if (player.soloRating > soloRatings[i].soloCompetitiveRank) {
                            break;
                        }
                    }
                    player.soloRank = i;
                    player.soloRatingsLength = soloRatings.length;
                    var partyRatings = docs.filter(function(d) {
                        return d.competitiveRank;
                    });
                    partyRatings.sort(function(a, b) {
                        return b.competitiveRank - a.competitiveRank;
                    });
                    for (var i = 0; i < partyRatings.length; i++) {
                        if (player.partyRating > partyRatings[i].competitiveRank) {
                            break;
                        }
                    }
                    player.partyRank = i;
                    player.partyRatingsLength = partyRatings.length;
                    //TODO cache ratings results in redis
                    console.timeEnd("computing ratings");
                    render();
                });
            }
            */
            else {
                render();
            }

            function render() {
                console.timeEnd("player " + req.params.account_id);
                if (req.query.json) {
                    return res.json(result.player);
                }
                res.render("player/player_" + info, {
                    q: req.query,
                    route: info,
                    tabs: playerPages,
                    player: player,
                    trackedPlayers: result.sets.trackedPlayers,
                    bots: result.sets.bots,
                    ratingPlayers: result.sets.ratingPlayers,
                    histograms: histograms,
                    teammate_ids: teammate_ids,
                    compare_data: compare_data,
                    compare: info === "compare",
                    title: (player.personaname || player.account_id) + " - YASP"
                });
            }
        });
    });

    function generateTeammateArray(input, player, cb) {
        if (!input) {
            return cb();
        }
        console.time('teammate list');
        var teammates_arr = [];
        var teammates = input;
        for (var id in teammates) {
            var tm = teammates[id];
            id = Number(id);
            //don't include if anonymous, self or if few games together
            if (id !== Number(player.account_id) && id !== constants.anonymous_account_id && (tm.games >= 5)) {
                teammates_arr.push(tm);
            }
        }
        teammates_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        //limit to 200 max players
        teammates_arr = teammates_arr.slice(0,200);
        queries.fillPlayerNames(teammates_arr, function(err) {
            console.timeEnd('teammate list');
            cb(err, teammates_arr);
        });
    }
});
module.exports = players;