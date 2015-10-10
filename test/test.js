var config = require('../config');
config.PORT = ""; //use service defaults
config.MONGO_URL = "mongodb://localhost/test";
config.POSTGRES_URL = "postgres://postgres:postgres@localhost/template1";
config.REDIS_URL = "redis://localhost:6379/1";
config.SESSION_SECRET = "testsecretvalue";
config.NODE_ENV = "test";
config.ENABLE_MATCH_CACHE = 1;
config.ENABLE_PLAYER_CACHE = 1;
var async = require('async');
var redis = require('../redis');
var queue = require('../queue');
var nock = require('nock');
var moment = require('moment');
var assert = require('assert');
var request = require('request');
var constants = require('../constants.js');
/*
var processApi = require('../processApi');
var processFullHistory = require('../processFullHistory');
var processMmr = require('../processMmr');
*/
//var updateNames = require('../tasks/updateNames');
var queueReq = require('../utility').queueReq;
var supertest = require('supertest');
var replay_dir = "./testfiles/";
var pg = require('pg');
var fs = require('fs');
var wait = 90000;
var db = require('../db');
var app = require('../web');
var queries = require('../queries');
var insertMatch = queries.insertMatch;
var insertPlayer = queries.insertPlayer;
//nock.disableNetConnect();
//nock.enableNetConnect();
//fake api response
nock('http://api.steampowered.com')
    //500 error
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).reply(500, {})
    //fake match details
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).times(10).reply(200, require('./details_api.json'))
    //fake player summaries
    .get('/ISteamUser/GetPlayerSummaries/v0002/').query(true).reply(200, require('./summaries_api.json'))
    //non-retryable error
    .get('/IDOTA2Match_570/GetMatchHistory/V001/').query(true).reply(200, {
        result: {
            error: "error"
        }
    })
    //fake full history
    .get('/IDOTA2Match_570/GetMatchHistory/V001/').query(true).reply(200, require('./history_api.json'));
//TODO page 2 for fullhistory?
//fake heroes list
//.get('/IEconDOTA2_570/GetHeroes/v0001/').query(true).reply(200, require('./heroes_api.json')
//fake leagues
//.get('/IDOTA2Match_570/GetLeagueListing/v0001/').query(true).reply(200, require('./leagues_api.json'));
//fake mmr response
nock("http://" + config.RETRIEVER_HOST).get('/?account_id=88367253').reply(200, require('./retriever_player.json'));
before(function(done) {
    this.timeout(wait);
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
                    var query = fs.readFileSync("./sql/create.sql", "utf8");
                    client.query(query, function(err, result) {
                        console.log('set up %s', config.POSTGRES_URL);
                        cb(err);
                    });
                });
            });
        },
        function(cb) {
            console.log("wiping redis");
            redis.flushdb(cb);
        },
        function(cb) {
            console.log("loading matches");
            async.mapSeries([require('./details_api.json').result], function(m, cb) {
                insertMatch(db, redis, queue, m, {
                    type: "api"
                }, cb);
            }, cb);
        },
        function(cb) {
            console.log("loading players");
            async.mapSeries(require('./summaries_api').response.players, function(p, cb) {
                insertPlayer(db, p, cb);
            }, cb);
        }], function(err) {
        require('../workServer');
        require('../workParser');
        done(err);
    });
});
describe("worker", function() {
    this.timeout(wait);
    //TODO fix match/account_ids
    /*
    it('process details request', function(done) {
        queueReq(queue, "api_details", {
            match_id: 870061127
        }, {}, function(err, job) {
            assert(!err);
            assert(job);
            processApi(job, function(err) {
                done(err);
            });
        });
    });
    it('process mmr request', function(done) {
        queueReq(queue, "mmr", {
            match_id: 870061127,
            account_id: 88367253,
            url: "http://localhost:5100/?account_id=88367253"
        }, {}, function(err, job) {
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
        }, {}, function(err, job) {
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
        }, {}, function(err, job) {
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
    var tests = {
        '1781962623_source2.dem': 1781962623
    };
    for (var key in tests) {
        it('parse replay', function(done) {
            nock("http://" + config.RETRIEVER_HOST).get('/').query(true).reply(200, {
                match: {
                    cluster: 1,
                    replay_salt: key.split(".")[0].split("_")[1]
                }
            });
            //fake replay download
            nock("http://replay1.valve.net").get('/570/' + key).replyWithFile(200, replay_dir + key);
            var match = {
                match_id: tests[key],
                start_time: moment().format('X'),
                //url: "http://replay1.valve.net/"
            };
            queueReq(queue, "parse", match, {}, function(err, job) {
                assert(job && !err);
                queue.parse.once('completed', function(job2, result) {
                    if (job.jobId === job2.jobId) {
                        return done();
                    }
                });
            });
        });
    }
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
        var tests = Object.keys(constants.player_pages);
        tests.forEach(function(t) {
            it('/players/:valid/' + t, function(done) {
                supertest(app).get('/players/120269134/' + t).expect(200).end(function(err, res) {
                    done(err);
                });
            });
        });
    });
    describe("basic match page tests", function() {
        it('/matches/:invalid', function(done) {
            supertest(app).get('/matches/1').expect(500).end(function(err, res) {
                done(err);
            });
        });
        it('/matches/:valid', function(done) {
            supertest(app).get('/matches/1781962623').expect(200).end(function(err, res) {
                done(err);
            });
        });
    });
    describe("parsed match page tests", function() {
        var tests = Object.keys(constants.match_pages);
        tests.forEach(function(t) {
            it('/matches/:valid_parsed/' + t, function(done) {
                //new RegExp(t, "i")
                supertest(app).get('/matches/1781962623/' + t).expect(200).expect(/1781962623/).end(function(err, res) {
                    done(err);
                });
            });
        });
    });
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