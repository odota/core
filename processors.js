var utility = require('./utility');
var async = require('async');
var db = require('./db');
var logger = utility.logger;
var fs = require('fs');
var getData = utility.getData;
var request = require('request');
var operations = require('./operations');
var insertPlayer = operations.insertPlayer;
var insertMatch = operations.insertMatch;
var insertMatchProgress = operations.insertMatchProgress;
var spawn = require('child_process').spawn;
var domain = require('domain');
var JSONStream = require('JSONStream');
var constants = require('./constants.json');
var progress = require('request-progress');
var urllib = require('url');
var generateJob = utility.generateJob;
var config = require('./config');
var api_keys = config.STEAM_API_KEY.split(",");
var moment = require('moment');

function processParse(job, cb) {
    var match_id = job.data.payload.match_id;
    var match = job.data.payload;
    console.time("parse " + match_id);
    if (match.start_time < moment().subtract(7, 'days').format('X') && config.NODE_ENV !== "test") {
        //expired, even if we have url
        //parseable if we have a filename
        //skip this check in test
        console.log("parse: replay expired");
        job.data.payload.parse_status = 1;
        updateDb();
    }
    runParser(job, function(err, parsed_data) {
        if (err) {
            logger.info("match_id %s, error %s", match_id, err);
            return cb(err);
        }
        match_id = match_id || parsed_data.match_id;
        job.data.payload.match_id = match_id;
        job.data.payload.parsed_data = parsed_data;
        job.data.payload.parse_status = 2;
        updateDb();
    });

    function updateDb() {
        job.update();
        db.matches.update({
            match_id: match_id
        }, {
            $set: job.data.payload,
        }, function(err) {
            console.timeEnd("parse " + match_id);
            return cb(err, job.data.payload);
        });
    }
}

function runParser(job, cb) {
    logger.info("[PARSER] parsing from %s", job.data.payload.url || job.data.payload.fileName);
    //streams
    var inStream;
    var bz;
    var parser = spawn("java", ["-jar",
        "-Xmx64m",
        "parser/target/stats-0.1.0.one-jar.jar"
    ], {
        stdio: ['pipe', 'pipe', 'pipe'], //ignore stderr
        encoding: 'utf8'
    });
    var outStream = JSONStream.parse();
    var exited;
    var error = "incomplete";
    var d = domain.create();
    d.on('error', function exit(err) {
        if (!exited) {
            exited = true;
            //todo graceful shutdown
            //best is probably to have processparse running via cluster threads
            //then we can just crash this thread and master can respawn a new worker
            //in the meantime since one thread is spawning multiple children we can just kill the children?
            console.log(err);
            if (bz) {
                bz.kill();
            }
            if (parser) {
                parser.kill();
            }
            cb(err.message || err);
        }
    });
    d.run(function() {
        if (job.data.payload.fileName) {
            inStream = fs.createReadStream(job.data.payload.fileName);
            inStream.pipe(parser.stdin);
        }
        else if (job.data.payload.url) {
            inStream = progress(request.get({
                url: job.data.payload.url,
                encoding: null,
                timeout: 30000
            })).on('progress', function(state) {
                job.progress(state.percent, 100);
                outStream.write(JSON.stringify({
                    "type": "progress",
                    "key": state.percent
                }));
            }).on('response', function(response) {
                if (response.statusCode !== 200) {
                    error = "download error";
                    outStream.write(JSON.stringify({
                        "type": "error",
                        "key": error
                    }));
                }
            });
            bz = spawn("bunzip2");
            inStream.pipe(bz.stdin);
            bz.stdout.pipe(parser.stdin);
        }
        else {
            throw new Error("no parse input");
        }
        parser.stderr.on('data', function(data) {
            console.log(data.toString());
        });
        parser.on('exit', function(code) {
            error = code;
            outStream.write(JSON.stringify({
                "type": "exit",
                "key": code
            }));
        });
        parser.stdout.pipe(outStream);
        outStream.on('root', handleStream);
        outStream.on('end', function() {
            processEventBuffer();
            //fs.writeFileSync("./output.json", JSON.stringify(parsed_data));
        });
    });
    //parse state
    var entries = [];
    var name_to_slot = {};
    var hero_to_slot = {};
    var game_zero = 0;
    var parsed_data = utility.getParseSchema();
    parsed_data.version = constants.parser_version;
    var streamTypes = {
        "state": function(e) {
            if (e.key === "PLAYING") {
                game_zero = e.time;
            }
            console.log(e);
        },
        "hero_log": function(e) {
            //get hero by id
            var h = constants.heroes[e.key];
            hero_to_slot[h ? h.name : e.key] = e.slot;
            //push it to entries for hero log
            entries.push(e);
        },
        "name": function(e) {
            name_to_slot[e.key] = e.slot;
        },
        "match_id": function(e) {
            parsed_data.match_id = e.value;
        },
        "error": function(e) {
            console.log(e);
        },
        "exit": function(e) {
            console.log(e);
        },
        "progress": function(e) {
            console.log(e);
        }
    };

    function handleStream(e) {
        if (streamTypes[e.type]) {
            streamTypes[e.type](e);
        }
        else {
            entries.push(e);
        }
    }
    var types = {
        "epilogue": function() {
            error = false;
        },
        "hero_log": populate,
        "gold_reasons": function(e) {
            if (!constants.gold_reasons[e.key]) {
                //new gold reason
                console.log(e);
            }
            getSlot(e);
        },
        "xp_reasons": function(e) {
            if (!constants.xp_reasons[e.key]) {
                //new xp reason
                console.log(e);
            }
            getSlot(e);
        },
        "purchase": function(e) {
            getSlot(e);
            if (e.key.indexOf("recipe_") === -1) {
                e.type = "purchase_log";
                populate(e);
                //e.type = "purchase_time";
                //e.value = e.time;
                //populate(e);
            }
        },
        "modifier_applied": getSlot,
        "modifier_lost": getSlot,
        "healing": getSlot,
        "ability_trigger": getSlot,
        "item_uses": getSlot,
        "ability_uses": getSlot,
        "clicks": function(e) {
            //just 0 (other) the key for now since we dont know what the order_types are
            e.key = 0;
            getSlot(e);
        },
        "kills": function(e) {
            getSlot(e);
            var logs = ["npc_dota_hero_", "_tower", "_rax", "_fort", "_roshan"];
            var pass = logs.some(function(s) {
                return (e.key.indexOf(s) !== -1 && !e.target_illusion);
            });
            if (pass) {
                e.type = "kills_log";
                populate(e);
            }
            //reverse and log killed by
            var r = {
                time: e.time,
                key: e.unit,
                unit: e.key,
                type: "killed_by"
            };
            getSlotReverse(r);
        },
        "damage": function(e) {
            getSlot(e);
            //check if hero hit
            if (e.target_hero && !e.target_illusion) {
                var h = {
                    time: e.time,
                    key: e.inflictor,
                    unit: e.unit,
                    type: "hero_hits"
                };
                getSlot(h);
                //biggest hit
                e.max = true;
                e.type = "largest_hero_hit";
                populate(e);
            }
            //reverse and count as damage taken
            var r = {
                time: e.time,
                key: e.unit,
                unit: e.key,
                value: e.value,
                type: "damage_taken"
            };
            getSlotReverse(r);
        },
        "buyback_log": getSlot,
        "chat": function getChatSlot(e) {
            e.slot = name_to_slot[e.unit];
            //time, key, only, so we lose the original prefix (stored in unit)
            populate(e);
            //console.log(e);
        },
        //"chat_hero_kill": populate,
        "stuns": populate,
        "runes": populate,
        "runes_bottled": populate,
        "interval": function(e) {
            if (e.time >= 0) {
                //if on minute, add to lh/gold/xp
                if (e.time % 60 === 0) {
                    e.interval = true;
                    e.type = "times";
                    e.value = e.time;
                    populate(e);
                    e.type = "gold";
                    e.value = e.gold;
                    populate(e);
                    e.type = "xp";
                    e.value = e.xp;
                    populate(e);
                    e.type = "lh";
                    e.value = e.lh;
                    populate(e);
                }
                e.interval = false;
                //add to positions
                if (e.x && e.y) {
                    e.type = "pos";
                    e.key = [e.x, e.y];
                    e.posData = true;
                    //populate(e);
                    if (e.time < 600) {
                        e.type = "lane_pos";
                        populate(e);
                    }
                }
            }
            /*
            //log all the positions for animation
            e.type = "pos_log";
            populate(e);
            */
        },
        "obs": function(e) {
            e.key = JSON.parse(e.key);
            e.posData = true;
            populate(e);
            e.posData = false;
            e.type = "obs_log";
            populate(e);
        },
        "sen": function(e) {
            e.key = JSON.parse(e.key);
            e.posData = true;
            populate(e);
            e.posData = false;
            e.type = "sen_log";
            populate(e);
        }
    };

    function processEventBuffer() {
        //console.time("postprocess");
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            //adjust time by zero value to get actual game time
            e.time -= game_zero;
            if (types[e.type]) {
                types[e.type](e);
            }
            else {
                //no event handler for this type
                console.log(e);
            }
        }
        //console.timeEnd("postprocess");
        cb(error, parsed_data);
    }

    function assocName(name) {
        //given a name (npc_dota_visage_familiar...), tries to convert to the associated hero's name
        if (!name) {
            return;
        }
        else if (name in hero_to_slot) {
            return name;
        }
        else if (name.indexOf("illusion_") === 0) {
            //associate illusions with the heroes they are illusions of
            var s = name.slice("illusion_".length);
            return s;
        }
        else if (name.indexOf("npc_dota_") === 0) {
            //try to get the hero this minion is associated with
            //split by _
            var split = name.split("_");
            //get the third element
            var identifiers = [split[2], split[2] + "_" + split[3]];
            for (var i = 0; i < identifiers.length; i++) {
                var id = identifiers[i];
                //append to npc_dota_hero_, see if matches
                var attempt = "npc_dota_hero_" + id;
                if (attempt in hero_to_slot) {
                    return attempt;
                }
            }
        }
        return name;
    }

    function getSlot(e) {
        //on a reversed field, key should be merged since the unit was damaged/killed by the key or a minion
        //otherwise, unit should be merged since the damage/kill was done by the unit or a minion
        e.reverse ? e.key = assocName(e.key) : e.unit = assocName(e.unit);
        //use slot, then map value (could be undefined)
        e.slot = ("slot" in e) ? e.slot : hero_to_slot[e.unit];
        populate(e);
    }

    function getSlotReverse(e) {
        e.reverse = true;
        getSlot(e);
    }

    function populate(e) {
        if (!parsed_data.players[e.slot]) {
            //couldn't associate with a player, probably attributed to a creep/tower/necro unit
            //console.log(e);
            return;
        }
        var t = parsed_data.players[e.slot][e.type];
        if (typeof t === "undefined") {
            //parse data player doesn't have a type for this event
            console.log(e);
        }
        else if (e.posData) {
            var x = e.key[0];
            var y = e.key[1];
            if (!t[x]) {
                t[x] = {};
            }
            if (!t[x][y]) {
                t[x][y] = 0;
            }
            t[x][y] += 1;
        }
        else if (t.constructor === Array) {
            //determine whether we want the value only (interval) or the time and key (log)
            //either way this creates a new value so e can be mutated later
            var arrEntry = (e.interval) ? e.value : {
                time: e.time,
                key: e.key
            };
            t.push(arrEntry);
        }
        else if (typeof t === "object") {
            //add it to hash of counts
            e.value = e.value || 1;
            t[e.key] ? t[e.key] += e.value : t[e.key] = e.value;
        }
        else {
            //we must use the full reference since this is a primitive type
            //use the value most of the time, but key when stuns since value only holds Integers in Java
            if (e.max) {
                parsed_data.players[e.slot][e.type] = Math.max(parsed_data.players[e.slot][e.type], e.value || Number(e.key));
            }
            else {
                parsed_data.players[e.slot][e.type] = e.value || Number(e.key);
            }
        }
    }
}

function processApi(job, cb) {
    var payload = job.data.payload;
    job.log("api: starting");
    getData(job.data.url, function(err, body) {
        if (err) {
            //couldn't get data from api, non-retryable
            job.log(JSON.stringify(err));
            return cb(null, {
                error: err
            });
        }
        else if (body.response) {
            logger.info("summaries response");
            async.mapSeries(body.response.players, insertPlayer, function(err) {
                cb(err, body.response.players);
            });
        }
        else if (payload.match_id) {
            logger.info("details response");
            var match = body.result;
            //join payload with match
            for (var prop in payload) {
                match[prop] = (prop in match) ? match[prop] : payload[prop];
            }
            job.log("api: complete");
            if (match.request) {
                insertMatchProgress(match, job, function(err) {
                    cb(err);
                });
            }
            else {
                insertMatch(match, function(err) {
                    cb(err);
                });
            }
        }
        else {
            return cb("unknown response");
        }
    });
}

function processMmr(job, cb) {
    var payload = job.data.payload;
    getData(job.data.url, function(err, data) {
        if (err) {
            logger.info(err);
            return cb(err, err);
        }
        logger.info("mmr response");
        if (data.soloCompetitiveRank || data.competitiveRank) {
            db.ratings.insert({
                match_id: payload.match_id,
                account_id: payload.account_id,
                soloCompetitiveRank: data.soloCompetitiveRank,
                competitiveRank: data.competitiveRank,
                time: new Date()
            }, function(err) {
                cb(err);
            });
        }
        else {
            cb(null);
        }
    });
}

function processFullHistory(job, cb) {
    var player = job.data.payload;
    var heroArray = Object.keys(constants.heroes);
    heroArray = config.NODE_ENV === "test" ? heroArray.slice(0, 1) : heroArray;
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
                async.eachLimit(Object.keys(player.match_ids), api_keys.length, function(match_id, cb) {
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
module.exports = {
    processParse: processParse,
    processApi: processApi,
    processMmr: processMmr,
    processFullHistory: processFullHistory
};
