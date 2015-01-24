var dotenv = require('dotenv');
dotenv.load();
var async = require('async'),
    spawn = require('child_process').spawn,
    BigNumber = require('big-number').n,
    request = require('request'),
    winston = require('winston'),
    cheerio = require('cheerio'),
    fs = require('fs'),
    moment = require('moment'),
    AWS = require('aws-sdk'),
    redis = require('redis'),
    parseRedisUrl = require('parse-redis-url')(redis),
    bzip2 = require('compressjs').Bzip2,
    streamifier = require('streamifier');
var retrievers = process.env.RETRIEVER_HOST.split(",");
var replay_dir = "replays/";
var api_url = "https://api.steampowered.com/IDOTA2Match_570";
var summaries_url = "http://api.steampowered.com/ISteamUser";
var options = parseRedisUrl.parse(process.env.REDIS_URL || "redis://127.0.0.1:6379");
options.auth = options.password;
var kue = require('kue');
var db = require('monk')(process.env.MONGO_URL || "mongodb://localhost/dota");
db.get('matches').index('match_id', {
    unique: true
});
db.get('players').index('account_id', {
    unique: true
});
db.matches = db.get('matches');
db.players = db.get('players');
var redisclient = redis.createClient(options.port, options.host, {
    auth_pass: options.password
});
var jobs = kue.createQueue({
    redis: options
});
jobs.promote();
var transports = [];
if (process.env.NODE_ENV !== "test") {
    transports.push(new(winston.transports.Console)({
        'timestamp': true
    }));
}
var logger = new(winston.Logger)({
    transports: transports
});

function clearActiveJobs(type, cb) {
    kue.Job.rangeByType(type, 'active', 0, 999999999, 'ASC', function(err, docs) {
        if (err) {
            return cb(err);
        }
        async.mapSeries(docs,
            function(job, cb) {
                job.state('inactive', function(err) {
                    logger.info('[KUE] Unstuck %s ', job.data.title);
                    cb(err);
                });
            },
            function(err) {
                cb(err);
            });
    });
}

function fillPlayerNames(players, cb) {
    async.mapSeries(players, function(player, cb) {
        db.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if (dbPlayer) {
                for (var prop in dbPlayer) {
                    player[prop] = dbPlayer[prop];
                }
            }
            cb(err);
        });
    }, function(err) {
        cb(err);
    });
}

function getMatchesByPlayer(account_id, cb) {
        var search = {};
        if (account_id) {
            search.players = {
                $elemMatch: {
                    account_id: account_id
                }
            };
        }
        db.matches.find(search, {
            sort: {
                match_id: -1
            }
        }, function(err, docs) {
            cb(err, docs);
        });
    }
    /*
     * Makes search from a datatables call
     */
function makeSearch(search, columns) {
        var s = {};
        columns.forEach(function(c) {
            s[c.data] = "/.*" + search + ".*/";
        });
        return s;
    }
    /*
     * Makes sort from a datatables call
     */
function makeSort(order, columns) {
        var sort = {};
        order.forEach(function(s) {
            var c = columns[Number(s.column)];
            if (c) {
                sort[c.data] = s.dir === 'desc' ? -1 : 1;
            }
        });
        return sort;
    }
    /*
     * Converts a steamid 64 to a steamid 32
     *
     * Returns a BigNumber
     */
function convert64to32(id) {
        return BigNumber(id).minus('76561197960265728');
    }
    /*
     * Converts a steamid 64 to a steamid 32
     *
     * Returns a BigNumber
     */
function convert32to64(id) {
    return BigNumber('76561197960265728').plus(id);
}

function isRadiant(player) {
    return player.player_slot < 64;
}

function queueReq(type, payload, cb) {
    checkDuplicate(type, payload, function(err) {
        if (err) {
            return cb(err);
        }
        var job = generateJob(type, payload);
        var kuejob = jobs.create(job.type, job).attempts(10).backoff({
            delay: 60000,
            type: 'exponential'
        }).removeOnComplete(true).save(function(err) {
            logger.info("[KUE] created jobid: %s", kuejob.id);
            cb(err, kuejob);
        });
    });
}

function checkDuplicate(type, payload, cb) {
    if (type === "api_details" && payload.match_id) {
        //make sure match doesn't exist already in db
        db.matches.findOne({
            match_id: payload.match_id
        }, function(err, doc) {
            if (!err && !doc) {
                return cb(null);
            }
            cb(new Error("duplicate found"));
        });
    }
    else {
        //no duplicate check for anything else
        cb(null);
    }
}

function generateJob(type, payload) {
    if (type === "api_details") {
        return {
            url: api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + payload.match_id,
            title: [type, payload.match_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_history") {
        return {
            url: api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + payload.account_id + "&matches_requested=10",
            title: [type, payload.account_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_summaries") {
        var steamids = [];
        payload.players.forEach(function(player) {
            steamids.push(convert32to64(player.account_id).toString());
        });
        payload.query = steamids.join();
        return {
            url: summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + payload.query,
            title: [type, payload.summaries_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "upload") {
        return {
            type: type,
            title: [type, payload.fileName].join(),
            payload: payload
        };
    }
    if (type === "parse") {
        return {
            title: [type, payload.match_id].join(),
            type: type,
            payload: {
                match_id: payload.match_id,
                start_time: payload.start_time
            }
        };
    }
    else {
        logger.info("unknown type for generateJob");
        return null;
    }
}

function runParse(input, cb) {
    var parser_file = "parser/target/stats-0.1.0.jar";
    var output = "";
    var cp = spawn("java", ["-jar",
        parser_file
    ]);
    //if string, read the file into a stream
    if (typeof input === "string") {
        fs.createReadStream(input).pipe(cp.stdin);
    }
    //if buffer, make a new stream
    if (Buffer.isBuffer(input)) {
        streamifier.createReadStream(input).pipe(cp.stdin);
    }
    cp.stdout.on('data', function(data) {
        output += data;
    });
    cp.on('exit', function(code) {
        logger.info("[PARSER] exit code: %s", code);
        try {
            output = JSON.parse(output);
            return cb(code, output);
        }
        catch (e) {
            //error parsing json output
            logger.info(e);
            return cb(e);
        }
    });
}

function getData(url, cb) {
    setTimeout(function() {
        if (typeof url === "object") {
            url = url[Math.floor(Math.random() * url.length)];
        }
        request({
            url: url,
            json: true
        }, function(err, res, body) {
            if (err || res.statusCode !== 200 || !body) {
                logger.info("retrying getData: %s", url);
                return setTimeout(function() {
                    getData(url, cb);
                }, 1000);
            }
            logger.info("got data: %s", url);
            if (body.result) {
                //steam api response
                if (body.result.status === 15 || body.result.error === "Practice matches are not available via GetMatchDetails") {
                    //user does not have stats enabled or attempting to get private match, don't retry
                    logger.info(body);
                    return cb(body);
                }
                else if (body.result.error || body.result.status === 2) {
                    //valid response, but invalid data, retry
                    logger.info("retrying getData: %s, %s, %s", err, res.statusCode, url);
                    return setTimeout(function() {
                        getData(url, cb);
                    }, 1000);
                }
            }
            //generic valid response
            cb(null, body);
        });
    }, 1000);
}

function updateSummaries(cb) {
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
        async.map(docs, function(player, cb) {
            logger.info(player);
            arr.push(player);
            i += 1;
            if (arr.length >= 100 || i >= docs.length) {
                var summaries = {
                    summaries_id: new Date(),
                    players: arr
                };
                queueReq("api_summaries", summaries, function(err) {
                    arr = [];
                    return cb(err);
                });
            }
            else {
                cb(null);
            }
        }, function(err) {
            cb(err, i);
        });
    });
}

function getCurrentSeqNum(cb) {
    getData(api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY, function(err, data) {
        cb(err, data.result.matches[0].match_seq_num);
    });
}

function processApi(job, cb) {
    //process an api request
    var payload = job.data.payload;
    if (!job.data.url) {
        logger.info(job);
        cb("no url");
    }
    getData(job.data.url, function(err, data) {
        if (err) {
            return cb(err);
        }
        if (data.response) {
            //summaries response
            async.map(data.response.players, insertPlayer, function(err) {
                cb(err);
            });
        }
        else if (payload.match_id) {
            //response for single match details
            var match = data.result;
            insertMatch(match, function(err) {
                cb(err);
            });
        }
        else if (payload.account_id) {
            //response for match history for single player
            var resp = data.result.matches;
            async.map(resp, function(match, cb2) {
                queueReq("api_details", match, function(err) {
                    cb2(err);
                });
            }, function(err) {
                cb(err);
            });
        }
    });
}

function processUpload(job, cb) {
    var fileName = job.data.payload.fileName;
    runParse(fileName, function(code, output) {
        fs.unlink(fileName, function(err) {
            logger.info(err);
        });
        if (!code) {
            var api_container = generateJob("api_details", {
                match_id: output.match_id
            });
            //check api to fill rest of match info
            getData(api_container.url, function(err, body) {
                if (err) {
                    return cb(err);
                }
                var match = body.result;
                match.parsed_data = output;
                match.upload = true;
                insertMatch(match, function(err) {
                    cb(err);
                });
            });
        }
        else {
            //only try once, mark done regardless of result
            cb(null);
        }
    });
}

function processParse(job, cb) {
    async.waterfall([
        async.apply(checkLocal, job),
        getReplayUrl,
        getReplayData,
    ], function(err, job2) {
        var match_id = job2.data.payload.match_id;
        if (err) {
            logger.info("[PARSER] %s, error: %s", match_id, err);
            if (err === "S3 UNAVAILABLE") {
                //don't retry
                db.matches.update({
                    match_id: match_id
                }, {
                    $set: {
                        parse_status: 1
                    }
                });
                //todo this isn't optimal since this marks the job as complete, so it immediately disappears
                return cb();
            }
            return cb(err);
        }
        else {
            if (process.env.DELETE_REPLAYS) {
                fs.unlinkSync(job2.data.fileName);
            }
            return cb(err);
        }
    });
}

function processParseStream(job, cb) {
    job.data.stream = true;
    processParse(job, cb);
}

function checkLocal(job, cb) {
    var match_id = job.data.payload.match_id;
    if (!fs.existsSync(replay_dir)) {
        fs.mkdir(replay_dir);
    }
    var fileName = replay_dir + match_id + ".dem";
    if (fs.existsSync(fileName)) {
        logger.info("[PARSER] %s, found local replay", match_id);
        job.data.fileName = fileName;
        job.update();
    }
    cb(null, job);
}

function getReplayUrl(job, cb) {
    if (job.data.url || job.data.fileName) {
        //can skip getting url
        return cb(null, job, job.data.url);
    }
    var match = job.data.payload;
    if (match.start_time > moment().subtract(7, 'days').format('X')) {
        var urls = [];
        for (var i = 0; i < retrievers.length; i++) {
            urls[i] = retrievers[i] + "?match_id=" + job.data.payload.match_id;
        }
        getData(urls, function(err, body) {
            if (!err && body && body.match) {
                var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
                return cb(null, job, url);
            }
            logger.info(err, body);
            return cb("invalid body or error");
        });
    }
    else {
        getS3Url(match.match_id, function(err, url) {
            cb(err, job, url);
        });
    }
}

function streamReplayData(job, url, cb) {
    var match_id = job.data.payload.match_id;
    var t1 = new Date().getTime();
    logger.info("[PARSER] streaming from %s", url);
    request
        .get({
            url: url,
            encoding: null
        }, function(err, resp, body) {
            if (err || resp.statusCode !== 200) {
                return cb("DOWNLOAD ERROR");
            }
            //todo figure out how to stream data directly through decompressor
            var t2 = new Date().getTime();
            logger.info("[PARSER] %s, dl time: %s", match_id, (t2 - t1) / 1000);
            var decomp = bzip2.decompressFile(body);
            var t3 = new Date().getTime();
            logger.info("[PARSER] %s, decomp time: %s", match_id, (t3 - t2) / 1000);
            return parseReplay(job, decomp, cb);
        });
}

function downloadReplayData(job, url, cb) {
    var match_id = job.data.payload.match_id;
    var fileName = replay_dir + match_id + ".dem";
    var archiveName = fileName + ".bz2";
    logger.info("[PARSER] downloading from %s", url);
    var t1 = new Date().getTime();
    request({
            url: url,
            encoding: null
        }).on('error', function(err) {
            return cb(err);
        })
        .on('response', function(resp) {
            var t2 = new Date().getTime();
            logger.info("[PARSER] %s, dl time: %s", match_id, (t2 - t1) / 1000);
            decompress(archiveName, function(err) {
                if (err) {
                    return cb(err);
                }
                job.data.fileName = fileName;
                job.update();
                var t3 = new Date().getTime();
                logger.info("[PARSER] %s, decomp time: %s", match_id, (t3 - t2) / 1000);
                return parseReplay(job, fileName, cb);
            });
        })
        .pipe(fs.createWriteStream(archiveName));
}

function parseReplay(job, input, cb) {
    var match_id = job.data.payload.match_id;
    var t3 = new Date().getTime();
    runParse(input, function(err, output) {
        if (err) {
            return cb(err);
        }
        var t4 = new Date().getTime();
        logger.info("[PARSER] %s, parse time: %s", match_id, (t4 - t3) / 1000);
        db.matches.update({
            match_id: output.match_id
        }, {
            $set: {
                parsed_data: output,
                parse_status: 2
            }
        }, function(err) {
            cb(err, job);
        });
    });
}

function getReplayData(job, url, cb) {
    job.data.url = url;
    job.update();
    if (job.data.fileName) {
        parseReplay(job, job.data.fileName, cb);
    }
    else {
        job.data.stream ? streamReplayData(job, url, cb) : downloadReplayData(job, url, cb);
    }
}

function decompress(archiveName, cb) {
    var cp = spawn("bunzip2", [archiveName]);
    cp.on('exit', function(code) {
        cb(code);
    });
}

function getS3Url(match_id, cb) {
    if (process.env.AWS_S3_BUCKET) {
        var archiveName = match_id + ".dem.bz2";
        var s3 = new AWS.S3();
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: archiveName
        };
        s3.headObject(params, function(err, data) {
            if (!err) {
                var url = s3.getSignedUrl('getObject', params);
                cb(null, url);
            }
            else {
                logger.info("[S3] %s not in S3", match_id);
                cb("S3 UNAVAILABLE");
            }
        });
    }
    else {
        cb("S3 UNAVAILABLE");
    }
}

function uploadToS3(archiveName, body, cb) {
    if (process.env.AWS_S3_BUCKET) {
        var s3 = new AWS.S3();
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: archiveName
        };
        params.Body = body;
        s3.putObject(params, function(err, data) {
            logger.info(err, data);
            cb(err);
        });
    }
    else {
        logger.info("[S3] S3 not defined (skipping upload)");
        cb(null);
    }
}

function insertMatch(match, cb) {
    var summaries = {
        summaries_id: new Date(),
        players: match.players
    };
    //queue for player names
    queueReq("api_summaries", summaries, function(err) {
        if (err) {
            return logger.info(err);
        }
    });
    //parse if unparsed
    if (match.parsed_data) {
        match.parse_status = 2;
    }
    else {
        queueReq("parse", match, function(err) {
            if (err) {
                return logger.info(err);
            }
        });
    }
    db.matches.update({
            match_id: match.match_id
        }, {
            $set: match
        }, {
            upsert: true
        },
        function(err) {
            cb(err);
        });
}

function insertPlayer(player, cb) {
    var account_id = Number(convert64to32(player.steamid));
    player.last_summaries_update = new Date();
    db.players.update({
        account_id: account_id
    }, {
        $set: player
    }, {
        upsert: true
    }, function(err) {
        cb(err);
    });
}

function scanApi(seq_num) {
    var trackedPlayers = {};
    db.players.find({
        track: 1
    }, function(err, docs) {
        if (err) {
            return scanApi(seq_num);
        }
        //rebuild set of tracked players before every check
        trackedPlayers = {};
        docs.forEach(function(player) {
            trackedPlayers[player.account_id] = true;
        });
        var url = api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + seq_num;
        getData(url, function(err, data) {
            if (err) {
                return scanApi(seq_num);
            }
            var resp = data.result.matches;
            var new_seq_num = seq_num;
            if (resp.length > 0) {
                new_seq_num = resp[resp.length - 1].match_seq_num + 1;
            }
            var filtered = [];
            for (var i = 0; i < resp.length; i++) {
                var match = resp[i];
                if (match.players.some(function(element) {
                        return (element.account_id in trackedPlayers);
                    })) {
                    filtered.push(match);
                }
            }
            logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length);
            async.mapSeries(filtered, insertMatch, function(err) {
                if (err) {
                    logger.info(err);
                }
                return scanApi(new_seq_num);
            });
        });
    });
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
                logger.info("[UNPARSED] match %s, jobid %s", match.match_id, job.id);
                cb(err);
            });
        }, function(err) {
            done(err, i);
        });
    });
}

function generateConstants(done) {
    var constants = require('./constants.json');
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
        var lookup = {};
        var array = constants.heroes;
        for (var i = 0; i < array.length; i++) {
            lookup[array[i].id] = array[i];
        }
        constants.heroes = lookup;
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
        lookup = {};
        var ability_ids = constants.ability_ids.abilities;
        for (var j = 0; j < ability_ids.length; j++) {
            lookup[ability_ids[j].id] = ability_ids[j].name;
        }
        constants.ability_ids = lookup;
        constants.ability_ids["5601"] = "techies_suicide";
        constants.ability_ids["5088"] = "skeleton_king_mortal_strike";
        constants.ability_ids["5060"] = "nevermore_shadowraze1";
        constants.ability_ids["5061"] = "nevermore_shadowraze1";
        constants.ability_ids["5580"] = "beastmaster_call_of_the_wild";
        constants.ability_ids["5637"] = "oracle_fortunes_end";
        constants.ability_ids["5638"] = "oracle_fates_edict";
        constants.ability_ids["5639"] = "oracle_purifying_flames";
        constants.ability_ids["5640"] = "oracle_false_promise";
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
        lookup = {};
        var regions = constants.regions.regions;
        for (var k = 0; k < regions.length; k++) {
            lookup[regions[k].id] = regions[k].name;
        }
        constants.regions = lookup;
        constants.regions["251"] = "Peru";
        constants.regions["261"] = "India";
        fs.writeFile("constants.json", JSON.stringify(constants, null, 2), function(err) {
            if (!err) {
                logger.info("[CONSTANTS] generated constants file");
            }
            return done(err);
        });
    });
}

function getFullMatchHistory(done) {
    var remote = process.env.REMOTE;
    var func = remote ? getHistoryRemote : getHistoryByHero;
    var match_ids = {};
    db.players.find({
        track: 1
    }, function(err, docs) {
        if (err) {
            return done(err);
        }
        async.mapSeries(docs, func, function(err) {
            for (var key in match_ids) {
                var match = {};
                match.match_id = key;
                logger.info(match);
                queueReq("api_details", match, function(err) {
                    logger.info(err);
                });
            }
            done(err);
        });
    });

    function getMatchPage(url, cb) {
        request({
            url: url,
            headers: {
                'User-Agent': 'request'
            }
        }, function(err, resp, body) {
            if (err || resp.statusCode !== 200) {
                return setTimeout(function() {
                    getMatchPage(url, cb);
                }, 1000);
            }
            logger.info("[REMOTE] %s", url);
            var parsedHTML = cheerio.load(body);
            var matchCells = parsedHTML('td[class=cell-xlarge]');
            matchCells.each(function(i, matchCell) {
                var match_url = remote + cheerio(matchCell).children().first().attr('href');
                var match_id = Number(match_url.split(/[/]+/).pop());
                match_ids[match_id] = 1;
            });
            var nextPath = parsedHTML('a[rel=next]').first().attr('href');
            if (nextPath) {
                getMatchPage(remote + nextPath, cb);
            }
            else {
                cb(null);
            }
        });
    }

    function getHistoryRemote(player, cb) {
        var account_id = player.account_id;
        var player_url = remote + "/players/" + account_id + "/matches";
        getMatchPage(player_url, function(err) {
            cb(err);
        });
    }

    function getHistoryByHero(player, cb) {
        //todo add option to use steamapi via specific player history and specific hero id (up to 500 games per hero)
        //for this player, make calls to getmatchhistory
        //one call for each hero in constants
        //paginate through to 500 games if necessary
        //generateJob();
    }
}

function mergeObjects(merge, val) {
    for (var attr in val) {
        if (val[attr].constructor === Array) {
            merge[attr] = merge[attr].concat(val[attr]);
        }
        else if (typeof val[attr] === "object") {
            mergeObjects(merge[attr], val[attr]);
        }
        else {
            //does property exist?
            if (!merge[attr]) {
                merge[attr] = val[attr];
            }
            else {
                merge[attr] += val[attr];
            }
        }
    }
}

function untrackPlayers(cb) {
    db.players.update({
        last_visited: {
            $lt: moment().subtract(process.env.UNTRACK_INTERVAL_DAYS || 3, 'days').toDate()
        }
    }, {
        $set: {
            track: 0
        }
    }, {
        multi: true
    }, function(err, num) {
        logger.info("[UNTRACK] Untracked %s users", num);
        cb(err, num);
    });
}

function startScan() {
    if (process.env.START_SEQ_NUM === "AUTO") {
        getCurrentSeqNum(function(err, num) {
            if (err) {
                return startScan();
            }
            scanApi(num);
        });
    }
    else if (process.env.START_SEQ_NUM) {
        scanApi(process.env.START_SEQ_NUM);
    }
    else {
        //start at highest id in db
        db.matches.findOne({
            upload: {
                $exists: false
            }
        }, {
            sort: {
                match_seq_num: -1
            }
        }, function(err, doc) {
            if (err) {
                return startScan();
            }
            scanApi(doc ? doc.match_seq_num + 1 : 0);
        });
    }
}

function mergeMatchData(match, constants) {
    var heroes = match.parsed_data.heroes;
    //loop through all units
    //look up corresponding hero_id
    //hero if can find in constants
    //find player slot associated with that unit(hero_to_slot)
    //merge into player's primary unit
    //if not hero attempt to associate with a hero
    for (var key in heroes) {
        var val = heroes[key];
        var primary = key;
        if (constants.hero_names[key]) {
            //is a hero
            var hero_id = constants.hero_names[key].id;
            var slot = match.parsed_data.hero_to_slot[hero_id];
            if (slot) {
                var primary_id = match.players[slot].hero_id;
                primary = constants.heroes[primary_id].name;
                //build hero_ids for each player
                if (!match.players[slot].hero_ids) {
                    match.players[slot].hero_ids = [];
                }
                match.players[slot].hero_ids.push(hero_id);
            }
            else {
                console.log("couldn't find slot for hero id %s", hero_id);
            }
        }
        else {
            //is not a hero
            primary = getAssociatedHero(key, heroes);
        }
        if (key !== primary) {
            //merge the objects into primary, but not with itself
            mergeObjects(heroes[primary], val);
        }
    }
    return match;
}

function getAssociatedHero(unit, heroes) {
    //assume all illusions belong to that hero
    if (unit.slice(0, "illusion_".length) === "illusion_") {
        unit = unit.slice("illusion_".length);
    }
    //attempt to recover hero name from unit
    if (unit.slice(0, "npc_dota_".length) === "npc_dota_") {
        //split by _
        var split = unit.split("_");
        //get the third element
        var identifier = split[2];
        if (split[2] === "shadow" && split[3] === "shaman") {
            identifier = "shadow_shaman";
        }
        //append to npc_dota_hero_, see if matches
        var attempt = "npc_dota_hero_" + identifier;
        if (heroes[attempt]) {
            unit = attempt;
        }
    }
    return unit;
}

function generateGraphData(match, constants) {
    //compute graphs
    var goldDifference = ['Gold'];
    var xpDifference = ['XP'];
    for (var i = 0; i < match.parsed_data.times.length; i++) {
        var goldtotal = 0;
        var xptotal = 0;
        match.parsed_data.players.forEach(function(elem, j) {
            if (match.players[j].player_slot < 64) {
                goldtotal += elem.gold[i];
                xptotal += elem.xp[i];
            }
            else {
                xptotal -= elem.xp[i];
                goldtotal -= elem.gold[i];
            }
        });
        goldDifference.push(goldtotal);
        xpDifference.push(xptotal);
    }
    var time = ["time"].concat(match.parsed_data.times);
    var data = {
        difference: [time, goldDifference, xpDifference],
        gold: [time],
        xp: [time],
        lh: [time]
    };
    match.parsed_data.players.forEach(function(elem, i) {
        var hero = constants.heroes[match.players[i].hero_id].localized_name;
        data.gold.push([hero].concat(elem.gold));
        data.xp.push([hero].concat(elem.xp));
        data.lh.push([hero].concat(elem.lh));
    });
    return match;
}

function fillPlayerInfo(player, cb) {
    getMatchesByPlayer(player.account_id, function(err, matches) {
        if (err) {
            return cb(err);
        }
        var account_id = player.account_id;
        var counts = {};
        var heroes = {};
        player.teammates = [];
        player.calheatmap = {};
        for (var i = 0; i < matches.length; i++) {
            //add start time to data for cal-heatmap
            player.calheatmap[matches[i].start_time] = 1;
            //compute top heroes
            for (var j = 0; j < matches[i].players.length; j++) {
                var p = matches[i].players[j];
                if (p.account_id === account_id) {
                    //find the "main" player's id
                    var playerRadiant = isRadiant(p);
                    matches[i].player_win = (playerRadiant === matches[i].radiant_win);
                    matches[i].slot = j;
                    matches[i].player_win ? player.win += 1 : player.lose += 1;
                    player.games += 1;
                    if (!heroes[p.hero_id]) {
                        heroes[p.hero_id] = {
                            games: 0,
                            win: 0,
                            lose: 0
                        };
                    }
                    heroes[p.hero_id].games += 1;
                    matches[i].player_win ? heroes[p.hero_id].win += 1 : heroes[p.hero_id].lose += 1;
                }
            }
            //compute top teammates
            for (j = 0; j < matches[i].players.length; j++) {
                var tm = matches[i].players[j];
                if (isRadiant(tm) === playerRadiant) { //teammates of player
                    if (!counts[tm.account_id]) {
                        counts[tm.account_id] = {
                            account_id: tm.account_id,
                            win: 0,
                            lose: 0,
                            games: 0
                        };
                    }
                    counts[tm.account_id].games += 1;
                    matches[i].player_win ? counts[tm.account_id].win += 1 : counts[tm.account_id].lose += 1;
                }
            }
        }
        //convert teammate counts to array and filter
        for (var id in counts) {
            var count = counts[id];
            if (count.games >= 2) {
                player.teammates.push(count);
            }
        }
        player.matches = matches;
        player.heroes = heroes;
        fillPlayerNames(player.teammates, function(err) {
            cb(err);
        });
    });
}
module.exports = {
    db: db,
    redis: redisclient,
    logger: logger,
    kue: kue,
    jobs: jobs,
    clearActiveJobs: clearActiveJobs,
    fillPlayerNames: fillPlayerNames,
    getMatchesByPlayer: getMatchesByPlayer,
    makeSearch: makeSearch,
    makeSort: makeSort,
    convert32to64: convert32to64,
    convert64to32: convert64to32,
    isRadiant: isRadiant,
    queueReq: queueReq,
    checkDuplicate: checkDuplicate,
    generateJob: generateJob,
    runParse: runParse,
    getData: getData,
    updateSummaries: updateSummaries,
    getCurrentSeqNum: getCurrentSeqNum,
    processParse: processParse,
    processParseStream: processParseStream,
    processApi: processApi,
    processUpload: processUpload,
    scanApi: scanApi,
    getReplayUrl: getReplayUrl,
    getS3Url: getS3Url,
    uploadToS3: uploadToS3,
    mergeObjects: mergeObjects,
    untrackPlayers: untrackPlayers,
    unparsed: unparsed,
    startScan: startScan,
    getFullMatchHistory: getFullMatchHistory,
    generateConstants: generateConstants,
    mergeMatchData: mergeMatchData,
    generateGraphData: generateGraphData,
    fillPlayerInfo: fillPlayerInfo
};