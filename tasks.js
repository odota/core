var utility = require('./utility');
var db = utility.db;
var fs = require('fs');
var async = require('async');
var queueReq = utility.queueReq;
var generateJob = utility.generateJob;
var getData = utility.getData;
var urllib = require('url');
var moment = require('moment');
var jobs = utility.jobs;
var kue = utility.kue;

function getFullMatchHistory(done, heroesToUse) {
    var constants = require('./constants.json');
    var heroArray = heroesToUse || Object.keys(constants.heroes);
    var match_ids = {};

    //only get full history if the player is tracked and doesn't have it already, do in queue order
    db.players.find({
        full_history: 0,
        track: 1
    }, {
        sort: {
            full_history_time: 1
        }
    }, function(err, players) {
        if (err) {
            return done(err);
        }
        //only do one per pass
        players = players.slice(0, 1);
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
                queueReq("api_details", match, function(err) {
                    //added a single job to kue
                    cb(err);
                });
            }, function(err) {
                if (err) {
                    return done(err);
                }
                //update full_history field
                async.mapSeries(players, function(player, cb) {
                    db.players.update({
                        account_id: player.account_id
                    }, {
                        $set: {
                            full_history: 2
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
}

function unparsed(done) {
    db.matches.find({
        parse_status: 0
    }, function(err, docs) {
        if (err) {
            return done(err);
        }
        var i = 0;
        async.mapSeries(docs, function(match, cb) {
            queueReq("parse", match, function(err, job) {
                i += 1;
                console.log("[UNPARSED] match %s, jobid %s", match.match_id, job.id);
                cb(err);
            });
        }, function(err) {
            console.log("added %s matches to parse queue", i);
            done(err, i);
        });
    });
}

function generateConstants(done) {
    var constants = require('./sources.json');
    async.map(Object.keys(constants.sources), function(key, cb) {
        var val = constants.sources[key];
        val = val.slice(-4) === "key=" ? val + process.env.STEAM_API_KEY : val;
        getData(val, function(err, result) {
            constants[key] = result;
            cb(err);
        });
    }, function(err) {
        if (err) {
            return done(err);
        }
        var heroes = constants.heroes.result.heroes;
        heroes.forEach(function(hero) {
            hero.img = "http://cdn.dota2.com/apps/dota2/images/heroes/" + hero.name.replace("npc_dota_hero_", "") + "_sb.png";
        });
        //key heroes by id
        var lookup = {};
        for (var i = 0; i < heroes.length; i++) {
            lookup[heroes[i].id] = heroes[i];
        }
        constants.heroes = lookup;
        //key heroes by name
        constants.hero_names = {};
        for (var i = 0; i < heroes.length; i++) {
            constants.hero_names[heroes[i].name] = heroes[i];
        }
        var items = constants.items.itemdata;
        constants.item_ids = {};
        for (var key in items) {
            constants.item_ids[items[key].id] = key;
            items[key].img = "http://cdn.dota2.com/apps/dota2/images/items/" + items[key].img;
        }
        constants.items = items;
        var abilities = constants.abilities.abilitydata;
        for (var key2 in abilities) {
            abilities[key2].img = "http://cdn.dota2.com/apps/dota2/images/abilities/" + key2 + "_md.png";
        }
        abilities.nevermore_shadowraze2 = abilities.nevermore_shadowraze1;
        abilities.nevermore_shadowraze3 = abilities.nevermore_shadowraze1;
        abilities.stats = {
            dname: "Stats",
            img: '../../public/images/Stats.png',
            attrib: "+2 All Attributes"
        };
        constants.abilities = abilities;
        fs.writeFile("constants.json", JSON.stringify(constants, null, 2), function(err) {
            if (!err) {
                console.log("[CONSTANTS] generated constants.json");
            }
            return done(err);
        });
    });
}

function unnamed(cb) {
    db.players.find({
        personaname: {
            $exists: false
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        var arr = [];
        var i = 0;
        async.mapSeries(docs, function(player, cb) {
            arr.push(player);
            i += 1;
            if (arr.length >= 100 || !docs[i + 1]) {
                console.log(i);
                var summaries = {
                    summaries_id: new Date(),
                    players: arr
                };
                queueReq("api_summaries", summaries, function(err) {
                    console.log("added job to kue");
                    arr = [];
                    return cb(err);
                });
            }
            else {
                cb(null);
            }
        }, function(err) {
            console.log("updated %s users", i);
            cb(err, i);
        });
    });
}

module.exports = {
    unnamed: unnamed,
    unparsed: unparsed,
    getFullMatchHistory: getFullMatchHistory,
    generateConstants: generateConstants
};