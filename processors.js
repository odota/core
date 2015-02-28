var utility = require('./utility');
var async = require('async');
var db = require('./db');
var logger = utility.logger;
var fs = require('fs');
var moment = require('moment');
var getData = utility.getData;
var request = require('request');
var operations = require('./operations');
var insertPlayer = operations.insertPlayer;
var insertMatch = operations.insertMatch;
var spawn = require('child_process').spawn;
var replay_dir = process.env.REPLAY_DIR || "./replays/";
var domain = require('domain');
var queueReq = operations.queueReq;
var JSONStream = require('JSONStream');
var constants = require('./constants.json');
var mode = utility.mode;

function processParse(job, cb) {
    var t1 = new Date();
    var attempts = job.toJSON().attempts.remaining;
    var noRetry = attempts <= 1;
    async.waterfall([
        async.apply(checkLocal, job),
        getReplayUrl,
        streamReplay,
    ], function(err) {
        var match_id = job.data.payload.match_id;
        logger.info("[PARSER] match_id %s, parse time: %s, error: %s", match_id, (new Date() - t1) / 1000, err);
        if (err === "replay expired" || (err && noRetry)) {
            logger.info("match_id %s, error %s, not retrying", match_id, err);
            return db.matches.update({
                match_id: match_id,
                parse_status: 0
            }, {
                $set: {
                    parse_status: 1
                }
            }, function(err2) {
                //nullify error if replay expired
                err = err === "replay expired" ? null : err;
                cb(err || err2);
            });
        }
        else if (err) {
            logger.info("match_id %s, error %s, attempts %s", match_id, err, attempts);
            return cb(err);
        }
        else {
            return cb(err, job.data.payload);
        }
    });
}

function checkLocal(job, cb) {
    var match_id = job.data.payload.match_id;
    var fileName = job.data.fileName || replay_dir + match_id + ".dem";
    if (fs.existsSync(fileName)) {
        logger.info("[PARSER] %s, found local replay", match_id);
        job.data.fileName = fileName;
        job.update();
    }
    cb(null, job);
}

function getReplayUrl(job, cb) {
    if (job.data.url || job.data.fileName) {
        logger.info("has url or fileName");
        return cb(null, job);
    }
    var match = job.data.payload;
    if (match.start_time > moment().subtract(7, 'days').format('X')) {
        getData("http://retriever?match_id=" + job.data.payload.match_id, function(err, body) {
            if (err || !body || !body.match) {
                return cb("invalid body or error");
            }
            var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
            job.data.url = url;
            job.data.payload.url = url;
            job.update();
            return cb(null, job);
        });
    }
    /*
    else if (process.env.AWS_S3_BUCKET) {
        getS3Url(match.match_id, function(err, url) {
            if (!url) {
                return cb("replay expired");
            }
            job.data.url = url;
            job.update();
            return cb(err, job);
        });
    }
    */
    else {
        cb("replay expired");
    }
}

function streamReplay(job, cb) {
    //var fileName = replay_dir + match_id + ".dem";
    //var archiveName = fileName + ".bz2";
    var match_id = job.data.payload.match_id;
    logger.info("[PARSER] streaming from %s", job.data.url || job.data.fileName);
    var d = domain.create();
    var bz;
    var parser;
    var error;
    var inStream;
    var exited;

    function exit(err) {
        if (!exited) {
            exited = true;
            cb(error || err.message || err);
        }
    }
    d.on('error', exit);
    d.run(function() {
        parser = runParser(function(err, output) {
            if (err) {
                return exit(err);
            }
            match_id = match_id || output.match_id;
            job.data.payload.match_id = match_id;
            job.data.payload.parsed_data = output;
            job.data.payload.parse_status = 2;
            job.update();
            db.matches.find({
                match_id: match_id
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                else if (docs.length) {
                    db.matches.update({
                        match_id: match_id
                    }, {
                        $set: job.data.payload,
                    }, function(err) {
                        return cb(err);
                    });
                }
                else {
                    console.log("parsed match not in db");
                    queueReq("api_details", job.data.payload, function(err, apijob) {
                        if (err) {
                            return cb(err);
                        }
                        apijob.on('complete', function() {
                            return cb();
                        });
                    });
                }
            });
        });
        if (job.data.fileName) {
            inStream = fs.createReadStream(job.data.fileName);
            inStream.pipe(parser.stdin);
        }
        else {
            bz = spawn("bunzip2");
            bz.stdout.pipe(parser.stdin);
            inStream = request.get({
                url: job.data.url,
                encoding: null,
                timeout: 30000
            });
            inStream.on('response', function(response) {
                if (response.statusCode !== 200) {
                    error = "download error";
                }
            }).pipe(bz.stdin);
        }
    });
}

function runParser(cb) {
    //todo choose a parser to stream from
    //todo set version based on parser?
    //todo handle parser errors
    var parser_file = "parser/target/stats-0.1.0.jar";
    var entries = [];
    var parsed_data = {
        "version": constants.parser_version,
        "game_zero": 0,
        "game_end": 0,
        "match_id": 0,
        "players": Array.apply(null, new Array(10)).map(function() {
            return {
                "stuns": -1,
                "lane": -1,
                "pos": [],
                "obs": [],
                "sen": [],
                "gold": [],
                "lh": [],
                "xp": [],
                "hero_log": [],
                "item_log": [],
                "kill_log": [],
                "buyback_log": [],
                "gold_reasons": {},
                "xp_reasons": {},
                "kills": {},
                "item_uses": {},
                "ability_uses": {},
                "hero_hits": {},
                "damage": {},
                "damage_taken": {},
                "runes": {},
                "runes_bottled": {},
                "killed_by": {}
            };
        }),
        "times": []
    };
    var name_to_slot = {};
    var hero_to_slot = {};
    var types = {
        "times": setData,
        "match_id": setData,
        "game_zero": setData,
        "game_end": setData,
        "hero_log": function(e) {
            //get hero by id
            var h = constants.heroes[e.key];
            hero_to_slot[h ? h.name : e.key] = e.slot;
            //add to player's hero list
            getSlot(e);
        },
        "name": function(e) {
            name_to_slot[e.key] = e.slot;
        },
        "gold_reasons": getSlot,
        "xp_reasons": getSlot,
        "item_log": getSlot,
        "item_uses": getSlot,
        "ability_uses": getSlot,
        "kills": getSlot,
        "damage": getSlot,
        "runes": getSlot,
        "runes_bottled": getSlot,
        "stuns": getSlot,
        "buyback_log": getSlot,
        "chat": getChatSlot,
        "lh": interval,
        "gold": interval,
        "xp": interval,
        "pos": translate,
        "obs": translate,
        "sen": translate,
        "hero_hits": getSlot,
        "kill_log": getSlot,
        "damage_taken": getSlotReverse,
        "killed_by": getSlotReverse
    };

    function preprocess(e) {
        (types[e.type]) ? types[e.type](e): console.log(e);
    }

    function setData(e) {
        var t = parsed_data[e.type];
        if (t.constructor === Array) {
            t.push(e.value);
        }
        else {
            parsed_data[e.type] = e.value;
        }
    }

    function translate(e) {
        //transform to 0-127 range from 64-191, y=0 at top left from bottom left
        e.key = JSON.parse(e.key);
        e.key = [e.key[0] - 64, 127 - (e.key[1] - 64)];
        e.position = true;
        entries.push(e);
    }

    function interval(e) {
        e.interval = true;
        entries.push(e);
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
            var s = name.slice("illusion_".length);
            return s;
        }
        else if (name.indexOf("npc_dota_") === 0) {
            //split by _
            var split = name.split("_");
            //get the third element
            var identifiers = [split[2], split[2] + "_" + split[3]];
            identifiers.forEach(function(id) {
                //append to npc_dota_hero_, see if matches
                var attempt = "npc_dota_hero_" + id;
                if (attempt in hero_to_slot) {
                    return attempt;
                }
            });
        }
    }

    function getSlot(e) {
        //on a reversed field, key should be merged since the unit was damaged/killed by the key or a minion
        //otherwise, unit should be merged since the damage/kill was done by the unit or a minion
        e.reverse ? e.key = assocName(e.key) : e.unit = assocName(e.unit);
        //use slot, then map value (could be undefined)
        e.slot = ("slot" in e) ? e.slot : hero_to_slot[e.unit];
        entries.push(e);
    }

    function getSlotReverse(e) {
        e.reverse = true;
        getSlot(e);
    }

    function getChatSlot(e) {
        e.slot = name_to_slot[e.unit];
        entries.push(e);
    }

    function processEntry(e) {
        e.time -= parsed_data.game_zero;
        if (typeof e.slot === "undefined") {
            //console.log(e);
            return;
        }
        var t = parsed_data.players[e.slot][e.type];
        if (t.constructor === Array) {
            e = (e.interval) ? e.value : {
                time: e.time,
                key: e.key
            };
            t.push(e);
        }
        else if (typeof t === "object") {
            e.value = e.value || 1;
            t[e.key] ? t[e.key] += e.value : t[e.key] = e.value;
        }
        else {
            parsed_data.players[e.slot][e.type] = e.value || Number(e.key);
        }
    }
    var parser = spawn("java", ["-jar",
        parser_file
    ], {
        stdio: ['pipe', 'pipe', 'ignore'], //don't handle stderr
        encoding: 'utf8'
    });
    var stream = JSONStream.parse();
    parser.stdout.pipe(stream);
    stream.on('root', preprocess);
    parser.on('exit', function(code) {
        if (code) {
            return cb(code);
        }
        entries.forEach(processEntry);
        var keys = Object.keys(types).filter(function(k) {
            return types[k] === translate;
        });
        parsed_data.players.forEach(function(p) {
            var lanes = [];
            keys.forEach(function(key) {
                var h = {};
                p[key].forEach(function(e) {
                    var x = e.key[0];
                    var y = e.key[1];
                    if (!h[x]) {
                        h[x] = {};
                    }
                    if (!h[x][y]) {
                        h[x][y] = 0;
                    }
                    h[x][y] += 1;
                    if (e.time <= 600 && key === "pos") {
                        lanes.push(constants.lanes[e.key[1]][e.key[0]]);
                    }
                });
                /*
                for (var x in h) {
                    for (var y in h[x]) {
                        if (h[x][y]) {
                            //points.push({x: x,y: y,value: map[y][x]});
                            //super hacker bit packing!
                            points.push((Number(x) << 24) + (Number(y) << 16) + h[x][y]);
                        }
                    }
                }
                p[key] = points;
                */
                p[key] = h;
            });
            p.lane = mode(lanes);
        });
        fs.writeFile("output2.json", JSON.stringify(parsed_data), function() {});
        cb(code, parsed_data);
    });
    return parser;
}

function processApi(job, cb) {
    //process an api request
    var payload = job.data.payload;
    getData(job.data.url, function(err, data) {
        if (err) {
            //encountered non-retryable error, pass back to kue as the result
            //cb with err causes kue to retry
            return cb(null, {
                error: err
            });
        }
        else if (data.response) {
            logger.info("summaries response");
            async.mapSeries(data.response.players, insertPlayer, function(err) {
                cb(err, job.data.payload);
            });
        }
        else if (payload.match_id) {
            logger.info("details response");
            var match = data.result;
            //join payload with match
            for (var prop in payload) {
                match[prop] = (prop in match) ? match[prop] : payload[prop];
            }
            insertMatch(match, function(err) {
                cb(err, job.data.payload);
            });
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
            //don't retry processmmr attempts, data will likely be out of date anyway
            return cb(null, err);
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
module.exports = {
    processParse: processParse,
    processApi: processApi,
    processMmr: processMmr
};
