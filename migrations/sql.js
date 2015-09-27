var config = require('../config');
var async = require('async');
var pg = require('knex')({
    client: 'pg',
    connection: config.POSTGRES_URL
});
var MongoClient = require('mongodb').MongoClient;
var url = config.MONGO_URL;
MongoClient.connect(url, function(err, db) {
    if (err) {
        throw err;
    }
    var args = process.argv.slice(2);
    var cursor;
    var migrate;
    if (args[0] === "matches") {
        cursor = db.collection('matches').find();
        migrate = processMatch;
    }
    else if (args[0] === "players") {
        cursor = db.collection('players').find();
        migrate = processPlayer;
    }
    else {
        throw "invalid option, choose matches or players";
    }
    cursor.nextObject(processItem);

    function processItem(err, item) {
        if (err) {
            throw err;
        }
        if (!item) {
            process.exit(0); // All done!
        }
        migrate(item, function(err) {
            if (err) {
                throw err;
            }
            process.nextTick(function() {
                cursor.nextObject(processItem);
            });
        });
    }

    function processMatch(m, cb) {
        //compute match radiant gold/xp adv for matches that don't have it
        if (m.parsed_data && !m.parsed_data.radiant_gold_adv) {
            m.parsed_data.radiant_gold_adv = [];
            m.parsed_data.radiant_xp_adv = [];
            for (var i = 0; i < m.parsed_data.players[0].times.length; i++) {
                var goldtotal = 0;
                var xptotal = 0;
                m.players.forEach(function(elem, j) {
                    var p = elem.parsedPlayer;
                    if (elem.isRadiant) {
                        goldtotal += p.gold[i];
                        xptotal += p.xp[i];
                    }
                    else {
                        xptotal -= p.xp[i];
                        goldtotal -= p.gold[i];
                    }
                });
                m.parsed_data.radiant_gold_adv.push(goldtotal);
                m.parsed_data.radiant_xp_adv.push(xptotal);
            }
        }
        pg('matches').columnInfo().then(function(info) {
            var row = {};
            for (var key in info) {
                if (key in m) {
                    row[key] = m[key];
                }
                else if (m.parsed_data && key in m.parsed_data) {
                    row[key] = m.parsed_data[key];
                }
                else {
                    row[key] = null;
                }
                if (typeof row[key] === "object" && row[key]) {
                    row[key] = JSON.stringify(row[key]);
                }
            }
            pg.insert(row).into('matches').asCallback(function(err) {
                if (err) {
                    return cb(err);
                }
                async.each(m.players, function(pm, cb) {
                    var parseSlot = pm.player_slot % (128 - 5);
                    var pp = m.parsed_data ? m.parsed_data.players[parseSlot] : null;
                    pg('player_matches').columnInfo().then(function(info) {
                        var row = {
                            match_id: m.match_id
                        };
                        for (var key in info) {
                            if (key === "gold_t") {
                                row.gold_t = pp ? pp.gold : null;
                            }
                            else if (key === "xp_t") {
                                row.gold_t = pp ? pp.xp : null;
                            }
                            else if (key === "lh_t") {
                                row.gold_t = pp ? pp.lh : null;
                            }
                            else if (key === "killed") {
                                row.gold_t = pp ? pp.kills : null;
                            }
                            else if (key in pm) {
                                row[key] = pm[key];
                            }
                            else if (pp && key in pp) {
                                row[key] = pp[key];
                            }
                            else {
                                row[key] = null;
                            }
                            if (typeof row[key] === "object" && row[key]) {
                                row[key] = JSON.stringify(row[key]);
                            }
                        }
                        pg.insert(row).into('player_matches').asCallback(cb);
                    });
                }, function(err) {
                    //next doc
                    cb(err);
                });
            });
        });
    }

    function processPlayer(p, cb) {
        pg('players').columnInfo().then(function(info) {
            var row = {};
            for (var key in info) {
                if (key === "last_login") {
                    row[key] = p.last_visited;
                }
                else {
                    row[key] = p[key];
                }
            }
            pg.insert(row).into('players').asCallback(function(err) {
                if (err) {
                    return cb(err);
                }
                //insert to player_ratings
                async.each(p.ratings, function(r, cb) {
                    pg('player_ratings').columnInfo().then(function(info) {
                        var row = {
                            account_id: p.account_id
                        };
                        for (var key in info) {
                            if (key === "solo_competitive_rank") {
                                row[key] = r.soloCompetitiveRank;
                            }
                            else if (key === "competitive_rank") {
                                row[key] = r.competitiveRank;
                            }
                            else {
                                row[key] = r[key];
                            }
                        }
                        pg.insert(row).into('player_ratings').asCallback(cb);
                    });
                }, function(err) {
                    //next doc
                    cb(err);
                });
            });
        });
    }
});
//TODO CODECHANGE
//stringify json pre-insert
//when inserting player_match select by match_id, player_slot to ensure uniqueness (account_id doesn't work since anonymous)
//update views to not ref parsedPlayer
//rename parsed_data.players.gold, lh, xp -> (gold_t, lh_t, xp_t), views, compute
//rename parsed_data.players.kills -> killed, views, compute
//rename last_visited -> last_login, multiple places
//rewrite fillplayerdata to select from player_matches join with matches then make separate query for played_with/played_against
//change player rating fields from camelcase to snake case (soloCompetitiveRank -> solo_competitive_rank)
//var db, var redis should only be present in top level (services)
//aggregator.js, update aggregator to not ref parsedPlayer
//compute.js update field names
//mmr.js, update insert query
//status.js, update queries
//buildSets.js, update queries
//routes/donate.js, update queries
//routes/matches.js, update queries
//getReplayUrl.js
//tasks/fullHistory.js (low priority)
//ag -i "mongo"
//TODO
//UPSERT not supported until psql 9.5
//fix tests
//bump version number (5)