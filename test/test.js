process.env.MONGO_URL = "mongodb://localhost/test";
process.env.REDIS_URL = "redis://localhost:6379/1";
process.env.SESSION_SECRET = "testsecretvalue";
process.env.KUE_USER = "user";
process.env.KUE_PASS = "pass";
process.env.PORT = 5000;
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
var processApi = require('../processApi');
var processFullHistory = require('../processFullHistory');
var processMmr = require('../processMmr');
var fs = require('fs');
var request = require('request');
var unparsed = require('../tasks/unparsed');
var updateNames = require('../tasks/updateNames');
var operations = require('../operations');
var queueReq = operations.queueReq;
var supertest = require('supertest');
var wait = 90000;
//fake retriever response
nock("http://" + process.env.RETRIEVER_HOST)
    /*
    .filteringPath(function(path) {
            return '/';
        })
        */
    .get('/?key=shared_secret_with_retriever').reply(200, {
        "accounts": {
            "76561198186929683": {
                "steamID": "76561198186929683",
                "replays": 6,
                "profiles": 0,
                "friends": 0
            }
        },
        "accountToIdx": {
            "26949": "76561198186929683"
        }
    })
    //fake mmr response
    .get('/?account_id=88367253').reply(200, {
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
    });
//fake api response
nock('http://api.steampowered.com').filteringPath(function(path) {
        var split = path.split("?");
        var split2 = split[0].split(".com");
        return split2[0];
    })
    //500 error
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').reply(500, {})
    //fake match details
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').times(10).reply(200, testdata.details_api)
    //fake player summaries
    .get('/ISteamUser/GetPlayerSummaries/v0002/').reply(200, testdata.summaries_api)
    //non-retryable error
    .get('/IDOTA2Match_570/GetMatchHistory/V001/').reply(200, {
        result: {
            error: "error"
        }
    })
    //fake full history
    .get('/IDOTA2Match_570/GetMatchHistory/V001/').reply(200, testdata.history_api)
    //fake full history page 2
    .get('/IDOTA2Match_570/GetMatchHistory/V001/').times(2).reply(200, testdata.history_api2)
    //fake heroes list
    .get('/IEconDOTA2_570/GetHeroes/v0001/').reply(200, testdata.heroes_api)
    //fake leagues
    .get('/IDOTA2Match_570/GetLeagueListing/v0001/').reply(200, {
        result: {
            leagues: []
        }
    });
var replay_dir = "./testfiles/";
console.log('starting web');
var app = require('../web');
var parser = require('../parser');
var parseManager = require('../parseManager');
//stuff we don't run in test
//scanner
//worker
//retriever
//skill
//proxy
before(function(done) {
    this.timeout(wait);
    var DatabaseCleaner = require('database-cleaner');
    var databaseCleaner = new DatabaseCleaner('mongodb');
    var connect = require('mongodb').connect;
    nock.enableNetConnect();
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
            //TODO use functions to prefill these rather than hardcoding
            redis.set("retrievers", JSON.stringify(["http://localhost:5100?key=null"]));
            redis.set("parsers", JSON.stringify(["http://localhost:5200?key=null"]));
            cb();
            },
            function(cb) {
            console.log("loading matches");
            async.mapSeries(testdata.matches, function(m, cb) {
                db.matches.insert(m, function(err) {
                    console.log(m.match_id);
                    cb(err);
                });
            }, function(err) {
                cb(err);
            });
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
            /*
            function(cb) {
            console.log('downloading replays');

            function dl(filename, cb) {
                //keep only the match id segment as the filename
                var arr = filename.split(".");
                arr[0] = arr[0].split("_")[0];
                var path = replay_dir + arr.join(".");
   
                console.log("downloading: %s", filename, path);
                //currently disabled caching of replays, get a fresh copy with each test
                if (fs.existsSync(path) && false) {
                    cb();
                }
                else {
                    var failed = false;
                    var to = setTimeout(function() {
                        failed = true;
                        console.log("download took too long, retrying");
                        dl(filename, cb);
                    }, 10000);

                    var inStream = request({
                            url: 'http://cdn.rawgit.com/yasp-dota/testfiles/master/' + filename
                        });

                    inStream.pipe(fs.createWriteStream(path)).on('error', function(err) {
                        console.log(err);
                        console.log('retrying dl %s', filename);
                        failed = true;
                        dl(filename, cb);
                    }).on('finish', function() {
                        if (!failed) {
                            console.log("completed %s", filename);
                            clearTimeout(to);
                            cb();
                        }
                    });
                }

            }
            var files = ['1151783218.dem.bz2', '1193091757.dem', '1181392470_1v1.dem', '1189263979_ardm.dem', 'invalid.dem'];
            async.each(files, dl, function(err) {
                cb(err);
            });
        }
                        */
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
            assert(!err);
            assert(job);
            processApi(job, function(err) {
                done(err);
            });
        });
    });
    it('process mmr request', function(done) {
        queueReq("mmr", {
            match_id: 870061127,
            account_id: 88367253,
            url: "http://localhost:5100/?account_id=88367253"
        }, function(err, job) {
            assert(!err);
            assert(job);
            processMmr(job, function(err) {
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
            assert(!err);
            assert(job);
            processApi(job, function(err) {
                done(err);
            });
        });
    });
    it('process fullhistory request', function(done) {
        queueReq("fullhistory", {
            account_id: 88367253
        }, function(err, job) {
            assert(!err);
            assert(job);
            processFullHistory(job, function(err) {
                done(err);
            });
        });
    });
});
describe("tasks", function() {
    this.timeout(wait);
    it('unparsed', function(done) {
        unparsed(function(err, num) {
            //todo why isn't this picking up any matches?
            //searches db for parse_status:0 and adds them to queue
            done(err);
        });
    });
    it('updateNames', function(done) {
        updateNames(function(err, num) {
            done(err);
        });
    });
});
describe("parser", function() {
    this.timeout(wait);
    beforeEach(function(done) {
        //fake retriever response
        nock("http://" + process.env.RETRIEVER_HOST).filteringPath(function(path) {
            return '/';
        }).get('/').reply(200, {
            match: {
                cluster: 1,
                replaySalt: 1
            }
        });
        done();
    });
    it('parse replay (zipped download)', function(done) {
        //fake replay download
        nock("http://replay1.valve.net").filteringPath(function(path) {
            return '/';
        }).get('/').replyWithFile(200, replay_dir + '1151783218.dem.bz2');
        var job = {
            match_id: 1151783218,
            start_time: moment().format('X'),
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            job.parser_url = "http://localhost:5200?key=";
            job.on("complete", function() {
                done();
            });
            job.on("failed attempt", function() {
                done("failed");
            });
        });
    });
    //TODO use function to run a set of these
    //1v1, ardm, 6.84
    it('parse replay (local)', function(done) {
        var job = {
            match_id: 1193091757,
            start_time: moment().format('X'),
            fileName: replay_dir + "1193091757.dem"
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            job.parser_url = "http://localhost:5200?key=";
            job.on("complete", function() {
                done();
            });
        });
    });
    it('parse invalid file', function(done) {
        //write invalid replay file
        fs.writeFileSync(replay_dir + "invalid.dem", "asdf");
        var job = {
            match_id: 1,
            start_time: moment().format('X'),
            fileName: replay_dir + "invalid.dem"
        };
        queueReq("parse", job, function(err, job) {
            assert(job && !err);
            job.parser_url = "http://localhost:5200?key=";
            job.on("failed attempt", function() {
                done();
            });
        });
    });
});
describe("web", function() {
    //this.timeout(wait);
    describe("main page tests", function() {
        it('/', function(done) {
            supertest(app).get('/')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).expect(/YASP/).end(function(err, res) {
                    done(err);
                });
        });
        it('/status', function(done) {
            supertest(app).get('/status')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).expect(/Status/).end(function(err, res) {
                    done(err);
                });
        });
        it('/ratings', function(done) {
            supertest(app).get('/ratings')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).expect(/Ratings/).end(function(err, res) {
                    done(err);
                });
        });
        it('/faq', function(done) {
            supertest(app).get('/faq')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).expect(/FAQ/).end(function(err, res) {
                    done(err);
                });
        });
        it('/page/1', function(done) {
            supertest(app).get('/page/1')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).expect(/Blog/).end(function(err, res) {
                    done(err);
                });
        });
        it('/carry', function(done) {
            supertest(app).get('/carry')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).expect(/Carry/).end(function(err, res) {
                    done(err);
                });
        });
        it('/:invalid', function(done) {
            supertest(app).get('/asdf')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(404).end(function(err, res) {
                    done(err);
                });
        });
    })
    describe("player page tests", function() {
        var tests = ["", "matches", "histograms", "counts", "asdf"];
        tests.forEach(function(t) {
            it('/players/:valid/' + t, function(done) {
                supertest(app).get('/players/88367253/' + t).expect(200).end(function(err, res) {
                    done(err);
                });
            });
        });
    });
    describe("unparsed match page tests", function() {
        it('/matches/:invalid', function(done) {
            supertest(app).get('/matches/1').expect(500).end(function(err, res) {
                done(err);
            });
        });
        /*
        it('/matches/:valid', function(done) {
            supertest(app).get('/matches/870061127').expect(200).end(function(err, res) {
                done(err);
            });
        });
        */
    });
    describe("parsed match page tests", function() {
        var tests = ["", "performances", "purchases", "chat", "asdf"];
        tests.forEach(function(t) {
            it('/matches/:valid_parsed/' + t, function(done) {
                //new RegExp(t, "i")
                supertest(app).get('/matches/1193091757/' + t).expect(200).expect(/Match/).end(function(err, res) {
                    done(err);
                });
            });
        });
        });
    });
    describe("api tests", function() {
        //todo supertest these?
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
});
var io = require('socket.io-client');
describe("unit test", function() {
    this.timeout(wait);
    it('socket request', function(done) {
        jobs.process('request', processApi);
        //fake replay download
        nock('http://replay1.valve.net').filteringPath(function(path) {
            return '/';
        }).get('/').replyWithFile(200, replay_dir + '1151783218.dem.bz2');
        var socket = io.connect('http://localhost:5000');
        socket.on('connect', function() {
            console.log('connected to server websocket');
            socket.emit('request', {
                match_id: 1151783218,
                response: ""
            });
            socket.on('failed', function() {
                done();
            });
            socket.on('complete', function() {
                done();
            });
        });
    });
});
//deprecated tests
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
    //test for logout
    */
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
/*
//zombiejs tests
    it('/ should 200', function(done) {
    browser.visit('/', function(err) {
        browser.assert.status(200);
        done(err);
    });
});
it('/ should say YASP', function(done) {
    browser.visit('/', function(err) {
        browser.assert.text('body', /YASP/);
        done(err);
    });
});
describe("/matches", function() {
    browser.visit('/matches', function(err) {
        it('should 200', function(done) {
            browser.assert.status(200);
            done();
        });
        it('should say Matches', function(done) {
            browser.assert.text('body', /Matches/);
            done();
        });
    });
});
*/