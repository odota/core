var config = require('../config');
config.PORT = ""; //use service defaults
config.MONGO_URL = "mongodb://localhost/test";
config.POSTGRES_URL = "postgres://postgres:postgres@localhost/template1";
config.REDIS_URL = "redis://localhost:6379/1";
config.SESSION_SECRET = "testsecretvalue";
config.NODE_ENV = "test";
var async = require('async');
var r = require('../redis');
var redis = r.client;
var testdata = require('./test.json');
var nock = require('nock');
var moment = require('moment');
var assert = require('assert');
/*
var processApi = require('../processApi');
var processFullHistory = require('../processFullHistory');
var processMmr = require('../processMmr');
*/
//var updateNames = require('../tasks/updateNames');
var queueReq = require('../utility').queueReq;
var queue = r.queue;
var buildSets = require("../buildSets");
var supertest = require('supertest');
var replay_dir = "./testfiles/";
var pg = require('pg');
var fs = require('fs');
var wait = 90000;
var db = require('../db');
var app = require('../web');
//var parser = require('../parser');
//var parseManager = require('../parseManager');
require('../workServer');
require('../parseClient');
nock.enableNetConnect();
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
before(function(done) {
    async.series([
        function(cb) {
            console.log('connecting to pg');
            pg.connect(config.POSTGRES_URL, function(err, client) {
                if (err) {
                    return cb(err);
                }
                console.log('cleaning db');
                //clean the db
                client.query('drop schema public cascade;create schema public;', function() {
                    //databaseCleaner.clean(client, function() {
                    console.log('cleaned %s', config.POSTGRES_URL);
                    //set up db
                    var query = fs.readFileSync("./migrations/create.sql", "utf8");
                    client.query(query, function(err, result) {
                        console.log('set up %s', config.POSTGRES_URL);
                        cb(err);
                    });
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
            console.log('building sets');
            /*
            nock("http://" + config.RETRIEVER_HOST).get('/?key=shared_secret_with_retriever').reply(200, {
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
            });
            */
            buildSets(db, redis, cb);
        },
        function(cb) {
            /*
            console.log("loading matches");
            async.mapSeries(testdata.matches, function(m, cb) {
                db.matches.insert(m, function(err) {
                    console.log(m.match_id);
                    cb(err);
                });
            }, function(err) {
                cb(err);
            });
            */
            cb();
        },
        function(cb) {
            /*
            console.log("loading players");
            async.mapSeries(testdata.players, function(p, cb) {
                db.players.insert(p, function(err) {
                    cb(err);
                });
            }, function(err) {
                cb(err);
            });
            */
            cb();
        }], function(err) {
        done(err);
    });
});
describe("worker", function() {
    this.timeout(wait);
    /*
    it('process details request', function(done) {
        queueReq(queue, "api_details", {
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
            //fake mmr response
            nock("http://" + config.RETRIEVER_HOST).get('/?account_id=88367253').reply(200, {
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
            "competitive_rank": 3228,
            "calibrationGamesRemaining": 0,
            "solo_competitive_rank": 3958,
            "soloCalibrationGamesRemaining": 0,
            "recruitmentLevel": 0
        });
        queueReq(queue, "mmr", {
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
        queueReq(queue, "api_summaries", {
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
        queueReq(queue, "fullhistory", {
            account_id: 88367253
        }, function(err, job) {
            assert(!err);
            assert(job);
            processFullHistory(job, function(err) {
                done(err);
            });
        });
    });
    */
});
describe("parser", function() {
    this.timeout(wait);
    beforeEach(function(done) {
        //fake match response
        nock("http://" + config.RETRIEVER_HOST).filteringPath(function(path) {
            console.log('hitting retriever');
            return '/';
        }).get('/').reply(200, {
            match: {
                cluster: 1,
                replay_salt: 1
            }
        });
        //fake replay download
        nock("http://replay1.valve.net").filteringPath(function(path) {
            console.log('hitting replay');
            return '/';
        }).get('/').replyWithFile(200, replay_dir + '1781962623_source2.dem');
        done();
    });
    //TODO define a list of file names/ids and run
    it('parse replay', function(done) {
        var job = {
            match_id: 1781962623,
            start_time: moment().format('X'),
            players: [{
                player_slot: 0
            }]
        };
        queueReq(queue, "parse", job, function(err, job) {
            assert(job && !err);
            job.parser_url = "http://localhost:5200?key=";
            job.on("complete", function() {
                done();
            });
            job.on("failed attempt", function(err) {
                done(err);
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
                .expect(200).end(function(err, res) {
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
        it('/faq', function(done) {
            supertest(app).get('/faq')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).expect(/FAQ/).end(function(err, res) {
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
    });
    describe("player page tests", function() {
        var tests = ["", "matches", "histograms", "counts", "compare", "asdf"];
        tests.forEach(function(t) {
            it('/players/:valid/' + t, function(done) {
                supertest(app).get('/players/83684080/' + t).expect(200).end(function(err, res) {
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
    /*
    describe("parsed match page tests", function() {
        var tests = ["", "performances", "purchases", "chat", "asdf"];
        tests.forEach(function(t) {
            it('/matches/:valid_parsed/' + t, function(done) {
                //new RegExp(t, "i")
                supertest(app).get('/matches/1193091757/' + t).expect(200).expect(/1193091757/).end(function(err, res) {
                    done(err);
                });
            });
        });
    });
    */
});
describe("api tests", function() {
    describe("/api/items", function() {
        it('should 200', function(done) {
            supertest(app).get('/api/items').expect(200).end(function(err, res) {
                done(err);
            });
        });
    });
    describe("/api/abilities", function() {
        it('should 200', function(done) {
            supertest(app).get('/api/abilities').expect(200).end(function(err, res) {
                done(err);
            });
        });
    });
});
/*
var io = require('socket.io-client');
describe("additional tests", function() {
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
*/
//zombiejs tests
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
describe("home", function(){
    it('/ should 200', function(done) {
        browser.visit('/', function(err) {
            browser.assert.status(200);
            done(err);
        });
    })
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