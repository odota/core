process.env.MONGO_URL = "mongodb://localhost/test";
process.env.REDIS_URL = "redis://localhost:6379/1";
process.env.SESSION_SECRET = "testsecretvalue";
process.env.KUE_USER = "user";
process.env.KUE_PASS = "pass";
process.env.PORT = 5000;
process.env.RETRIEVER_HOST = "localhost:5100";
process.env.REPLAY_DIR = "./replays_test/";
process.env.ROOT_URL = "http://localhost:5000";
process.env.NODE_ENV = "test";
process.env.STEAM_API_KEY = "fakekey";
var async = require('async');
var db = require('../db');
var r = require('../redis');
var redis = r.client;
var kue = r.kue;
var jobs = r.jobs;
var testdata = require('./test.json');
var nock = require('nock');
var moment = require('moment');
var assert = require('assert');
var Zombie = require('zombie');
var processors = require('../processors');
var fs = require('fs');
var request = require('request');
var unparsed = require('../tasks/unparsed');
var updatenames = require('../tasks/updatenames');
var fullhistory = require('../tasks/fullhistory');
var constants = require('../tasks/constants');
var queueReq = require('../operations').queueReq;
var wait = 60000;
Zombie.localhost('localhost', process.env.PORT);
var browser = new Zombie({
    maxWait: wait,
    runScripts: false
});
var replay_dir = process.env.REPLAY_DIR;
if (!fs.existsSync(replay_dir)) {
    fs.mkdir(replay_dir);
}
before(function(done) {
    this.timeout(wait);
    var DatabaseCleaner = require('database-cleaner');
    var databaseCleaner = new DatabaseCleaner('mongodb');
    var connect = require('mongodb').connect;
    async.series([
            function(cb) {
            console.log("wiping mongodb");
            connect(process.env.MONGO_URL, function(err, db) {
                assert(!err);
                databaseCleaner.clean(db, function(err) {
                    cb(err);
                });
            });
            },
            function(cb) {
            console.log("wiping redis");
            redis.flushall(function(err) {
                cb(err);
            });
            },
            function(cb) {
            console.log("loading services into redis");
            redis.set("bots", JSON.stringify([{
                "steamID": "76561198174479859",
                "attempts": 1,
                "success": 1,
                "friends": 0
                }, {
                "steamID": "76561198174456763",
                "attempts": 0,
                "success": 0,
                "friends": 201
                }, {
                "steamID": "76561198174616549",
                "attempts": 1,
                "success": 1,
                "friends": 250
                }, {
                "steamID": "76561198173905795",
                "attempts": 0,
                "success": 0,
                "friends": 199
                }, {
                "steamID": "76561198152395299",
                "attempts": 0,
                "success": 0,
                "friends": 10
                }, {
                "steamID": "76561198174715201",
                "attempts": 2,
                "success": 2,
                "friends": 1
                }]));
            redis.set("ratingPlayers", JSON.stringify({}));
            redis.set("retrievers", JSON.stringify(["http://localhost:5100"]));
            redis.set("parsers", JSON.stringify(["http://localhost:5200"]));
            cb();
            },
            function(cb) {
            console.log("loading players");
            //set visited date on first player
            testdata.players[0].last_visited = new Date();
            testdata.players[0].join_date = new Date("2012-08-31T15:59:02.161+0100");
            testdata.players[1].last_visited = new Date("2012-08-31T15:59:02.161+0100");
            async.mapSeries(testdata.players, function(p, cb) {
                db.players.insert(p, function(err) {
                    cb(err);
                });
            }, function(err) {
                cb(err);
            });
            },
            function(cb) {
            console.log("loading matches");
            async.mapSeries(testdata.matches, function(m, cb) {
                db.matches.insert(m, function(err) {
                    cb(err);
                });
            }, function(err) {
                cb(err);
            });
            },
            function(cb) {
            console.log("copying replays to test dir");
            nock.enableNetConnect('rawgit.com');

            function dl(filename, cb) {
                var arr = filename.split(".");
                arr[0] = arr[0].split("_")[0];
                var path = replay_dir + arr.join(".");
                if (fs.existsSync(path)) {
                    cb();
                }
                else {
                    request('http://cdn.rawgit.com/yasp-dota/testfiles/master/' + filename).pipe(fs.createWriteStream(path)).on('finish', function(err) {
                        cb(err);
                    });
                }
            }
            var files = ['1151783218.dem.bz2', '1193091757.dem', '1181392470_1v1.dem', '1189263979_ardm.dem', 'invalid.dem'];
            async.each(files, dl, function(err) {
                cb(err);
            });
            },
            function(cb) {
            console.log("starting web");
            nock.enableNetConnect();
            require('../web');
            cb();
            },
            function(cb) {
            console.log("setting up nock");
            //fake retriever response
            nock("http://" + process.env.RETRIEVER_HOST).filteringPath(function(path) {
                var split = path.split("?");
                return split[1];
            }).get('account_id=88367253').reply(200, {
                "accountId": 88367253,
                "wins": 889,
                "xp": 52,
                "level": 153,
                "lowPriorityUntilDate": 0,
                "preventVoiceUntilDate": 0,
                "teaching": 6,
                "leadership": 4,
                "friendly": 10,
                "forgiving": 5,
                "lowPriorityGamesRemaining": 0,
                "competitiveRank": 3228,
                "calibrationGamesRemaining": 0,
                "soloCompetitiveRank": 3958,
                "soloCalibrationGamesRemaining": 0,
                "recruitmentLevel": 0
            }).get('match_id=1151783218').reply(200, {
                match: {
                    cluster: 1,
                    replaySalt: 1
                }
            });
            //fake api response
            nock('http://api.steampowered.com').filteringPath(function(path) {
                    var split = path.split("?");
                    var split2 = split[0].split(".com");
                    return split2[0];
                })
                //throw some errors to test handling
                .get('/IDOTA2Match_570/GetMatchDetails/V001/').reply(500, {}).get('/IDOTA2Match_570/GetMatchDetails/V001/').times(2).reply(200, testdata.details_api).get('/ISteamUser/GetPlayerSummaries/v0002/').reply(200, testdata.summaries_api).get('/IDOTA2Match_570/GetMatchHistory/V001/').reply(200, {
                    result: {
                        error: "error"
                    }
                }).get('/IDOTA2Match_570/GetMatchHistory/V001/').reply(200, testdata.history_api).get('/IDOTA2Match_570/GetMatchHistory/V001/').times(2).reply(200, testdata.history_api2).get('/IEconDOTA2_570/GetHeroes/v0001/').reply(200, testdata.heroes_api);
            cb();
            }
        ], function(err) {
        done(err);
    });
});
describe("services", function() {
    it("mongodb connected", function(done) {
        assert(db);
        done();
    });
    it("redis connected", function(done) {
        assert(redis);
        done();
    });
    it("kue ready", function(done) {
        assert(kue);
        done();
    });
    it("kue jobs queue ready", function(done) {
        assert(jobs);
        done();
    });
});
describe("worker", function() {
    this.timeout(wait);
    it('process details request', function(done) {
        queueReq("api_details", {
            match_id: 870061127
        }, function(err, job) {
            assert(job);
            processors.processApi(job, function(err) {
                done(err);
            });
        });
    });
    it('process mmr request', function(done) {
        queueReq("mmr", {
            match_id: 870061127,
            account_id: 88367253,
            url: "http://localhost:5100?account_id=88367253"
        }, function(err, job) {
            assert(job);
            processors.processMmr(job, function(err) {
                done(err);
            });
        });
    });
    it('process summaries request', function(done) {
        queueReq("api_summaries", {
            players: [{
                account_id: 88367253
            }]
        }, function(err, job) {
            assert(job);
            processors.processApi(job, function(err) {
                done(err);
            });
        });
    });
});
describe("web", function() {
    this.timeout(wait);
    describe("/", function() {
        before(function(done) {
            browser.visit('/');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say YASP', function(done) {
            browser.assert.text('body', /YASP/);
            done();
        });
    });
    describe("/status", function() {
        before(function(done) {
            browser.visit('/status');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("/matches", function() {
        before(function(done) {
            browser.visit('/matches');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Matches', function(done) {
            browser.assert.text('h1', /Matches/);
            done();
        });
    });
    describe("/matches/:valid", function() {
        before(function(done) {
            browser.visit('/matches/1151783218');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should have a match', function(done) {
            browser.assert.text('h1', /Match\s1151783218/);
            done();
        });
    });
    describe("/matches/:invalid", function() {
        before(function(done) {
            browser.visit('/matches/1');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });
    describe("/matches/:invalid/details", function() {
        before(function(done) {
            browser.visit('/matches/1/details');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });
    describe("/players/:invalid", function() {
        before(function(done) {
            browser.visit('/players/1');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });
    describe("/players/:valid", function() {
        before(function(done) {
            browser.visit('/players/88367253');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should have a w/l record', function(done) {
            browser.assert.text('body', /.-./);
            done();
        });
    });
    describe("/players/:valid (no matches)", function() {
        before(function(done) {
            browser.visit('/players/88367251');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should have a w/l record', function(done) {
            browser.assert.text('body', /.-./);
            done();
        });
    });
    describe("/players/:valid/matches", function() {
        before(function(done) {
            browser.visit('/players/88367253/matches');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Matches', function(done) {
            browser.assert.text('h3', /Matches/);
            done();
        });
    });
    describe("/players/:valid/matchups", function() {
        before(function(done) {
            browser.visit('/players/88367253/matchups');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Teammates', function(done) {
            browser.assert.text('body', /Teammates/);
            done();
        });
    });
    describe("/players/:valid/:invalid", function() {
        before(function(done) {
            browser.visit('/players/88367253/asdf');
            browser.wait(wait, function(err) {
                done();
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("/players/:invalid/matches", function() {
        before(function(done) {
            browser.visit('/players/1/matches');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 500', function(done) {
            browser.assert.status(500);
            done();
        });
    });
    describe("/matches/:valid/details (unparsed)", function() {
        before(function(done) {
            browser.visit('/matches/1151783218/details');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should go to index', function(done) {
            browser.assert.text('body', /Victory/);
            done();
        });
    });
    describe("/matches/:valid/details (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/details');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Roshan', function(done) {
            browser.assert.text('body', /Roshan/);
            done();
        });
    });
    describe("/matches/:valid/timelines (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/timelines');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Kills', function(done) {
            browser.assert.text('body', /Kills/);
            done();
        });
    });
    describe("/matches/:valid/graphs (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/graphs');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Gold', function(done) {
            browser.assert.text('body', /Gold/);
            done();
        });
    });
    describe("/matches/:valid/positions (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/positions');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Positions', function(done) {
            browser.assert.text('body', /Positions/);
            done();
        });
    });
    describe("/matches/:valid/chat (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/chat');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Chat', function(done) {
            browser.assert.text('body', /Chat/);
            done();
        });
    });
    describe("/matches/:valid/:invalid (parsed)", function() {
        before(function(done) {
            browser.visit('/matches/1191329057/asdf');
            browser.wait(wait, function(err) {
                done();
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    /*
    describe("/login", function() {
        before(function(done) {
            browser.visit('/login');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("/return", function() {
        before(function(done) {
            browser.visit('/return');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    */
    describe("/about", function() {
        before(function(done) {
            browser.visit('/about');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    /*
    describe("GET /upload", function() {
        before(function(done) {
            browser.visit('/upload');
            browser.wait(wait, function(err) {
                done(err);
            });
        });
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
    });
    describe("POST /upload", function() {
        it('should upload', function(done) {
            var formData = {
                replay: fs.createReadStream(replay_dir + '/1193091757.dem')
            };
            request.post({
                url: process.env.ROOT_URL + '/upload',
                formData: formData
            }, function(err, resp, body) {
                assert(body);
                done(err);
            });
        });
    });
    */
    //todo test passport-steam login function
    describe("/logout", function() {
        it('should 200', function(done) {
            request.get(process.env.ROOT_URL + '/logout', function(err, resp, body) {
                assert(resp.statusCode === 200);
                done(err);
            });
        });
    });
    describe("invalid page", function() {
        before(function(done) {
            browser.visit('/asdf');
            browser.wait(wait, function(err) {
                assert(err);
                done();
            });
        });
        it('should 404', function(done) {
            browser.assert.status(404);
            done();
        });
    });
    describe("/api/matches", function() {
        it('should return JSON', function(done) {
            request.get(process.env.ROOT_URL + '/api/matches?draw=2&select%5Bplayers.account_id%5D=88367253&columns%5B0%5D%5Bdata%5D=match_id&columns%5B0%5D%5Bname%5D=&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=true&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=game_mode&columns%5B1%5D%5Bname%5D=&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=cluster&columns%5B2%5D%5Bname%5D=&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=duration&columns%5B3%5D%5Bname%5D=&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=start_time&columns%5B4%5D%5Bname%5D=&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=parse_status&columns%5B5%5D%5Bname%5D=&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc&start=0&length=10&search%5Bvalue%5D=&search%5Bregex%5D=false&_=1422621884994', function(err, resp, body) {
                assert(resp.statusCode === 200);
                JSON.parse(body);
                done(err);
            });
        });
    });
    describe("/api/items", function() {
        it('should 200', function(done) {
            request.get(process.env.ROOT_URL + '/api/items', function(err, resp, body) {
                assert(resp.statusCode === 200);
                done(err);
            });
        });
    });
    describe("/api/abilities", function() {
        it('should 200', function(done) {
            request.get(process.env.ROOT_URL + '/api/abilities', function(err, resp, body) {
                assert(resp.statusCode === 200);
                done(err);
            });
        });
    });
    describe("/preferences", function() {
        it('should return JSON', function(done) {
            request.post(process.env.ROOT_URL + '/preferences', {}, function(err, resp, body) {
                JSON.parse(body);
                done(err);
            });
        });
    });
    /*
    describe("/verify_recaptcha", function() {
        it('should return JSON', function(done) {
            request.post(process.env.ROOT_URL + '/verify_recaptcha', {
                form: {
                    recaptcha_challenge_field: "asdf",
                    recaptcha_response_field: "jkl;"
                }
            }, function(err, resp, body) {
                assert(resp.statusCode === 200);
                JSON.parse(body);
                done(err);
            });
        });
    });
    */
});
describe("tasks", function() {
    this.timeout(wait);
    it('unparsed', function(done) {
        unparsed(function(err, num) {
            assert(num);
            done(err);
        });
    });
    it('updatenames', function(done) {
        updatenames(function(err, num) {
            done(err);
        });
    });
    it('full history', function(done) {
        fullhistory(["1"], function(err) {
            done(err);
        });
    });
    it('constants', function(done) {
        //fake constants response
        nock('http://www.dota2.com').get('/jsfeed/itemdata?l=english').reply(200, testdata.item_api).get('/jsfeed/abilitydata').reply(200, testdata.ability_api).get('/jsfeed/heropickerdata').reply(200, {}).get('/jsfeed/heropediadata?feeds=herodata').reply(200, {});
        constants("./constants_test.json", function(err) {
            done(err);
        });
    });
});
describe("unit test", function() {
    /*
    it('initialize user', function(done) {
        utility.initializeUser("/76561198048632981", {
                _json: {}
            },
            function(err, user) {
                assert(user);
                done(err);
            });
    });
    */
    it('get rating data', function(done) {
        var queries = require("../queries");
        queries.getRatingData(88367253, function(err, results) {
            assert(results);
            done(err);
        });
    });
});
describe("parser", function() {
    this.timeout(wait);
    it('parse replay (download)', function(done) {
        //fake replay response
        nock('http://replay1.valve.net').filteringPath(function(path) {
            return '/';
        }).get('/').replyWithFile(200, replay_dir + '1151783218.dem.bz2');
        var job = {
            match_id: 1151783218,
            start_time: moment().format('X'),
            url: "http://replay1.valve.net"
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                //todo check the site to make sure templates work
                done(err);
            });
        });
    });
    it('parse replay (local)', function(done) {
        var job = {
            match_id: 1193091757,
            start_time: moment().format('X'),
            fileName: replay_dir + "/1193091757.dem"
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse 1v1', function(done) {
        var job = {
            match_id: 1181392470,
            start_time: moment().format('X'),
            fileName: replay_dir + "/1181392470.dem"
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse ardm', function(done) {
        var job = {
            match_id: 1189263979,
            start_time: moment().format('X'),
            fileName: replay_dir + "/1189263979.dem"
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                done(err);
            });
        });
    });
    it('parse invalid file', function(done) {
        var job = {
            match_id: 1,
            start_time: moment().format('X'),
            fileName: replay_dir + "/invalid.dem"
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            processors.processParse(job, function(err) {
                assert(err);
                done();
            });
        });
    });
});
