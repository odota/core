/**
 * Main test script to run tests
 **/
var config = require('../config');
var constants = require('../constants.js');
var redis = require('../store/redis');
var queue = require('../store/queue');
//var cassandra = require('../store/cassandra');
var queries = require('../store/queries');
config.PORT = ""; //use service defaults
config.POSTGRES_URL = "postgres://postgres:postgres@localhost/yasp_test";
config.REDIS_URL = "redis://localhost:6379/1";
config.SESSION_SECRET = "testsecretvalue";
config.NODE_ENV = "test";
config.ENABLE_MATCH_CACHE = 1;
config.FRONTEND_PORT = 5001;
config.PARSER_PORT = 5201;
var async = require('async');
var nock = require('nock');
var moment = require('moment');
var assert = require('assert');
var init_db = "postgres://postgres:postgres@localhost/postgres";
var pQueue = queue.getQueue('parse');
var supertest = require('supertest');
var replay_dir = "./test/testfiles/";
var pg = require('pg');
var fs = require('fs');
var wait = 90000;
var cassandra = require('../store/cassandra');
var buildMatch = require('../store/buildMatch');
// these are loaded later, as the database needs to be created when these are required
var db;
var app;
var details_api = require('./details_api.json');
//nock.disableNetConnect();
//nock.enableNetConnect();
//fake api response
nock('http://api.steampowered.com')
    //500 error
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).reply(500,
    {})
    //fake match details
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).times(10).reply(200, details_api)
    //fake player summaries
    .get('/ISteamUser/GetPlayerSummaries/v0002/').query(true).reply(200, require('./summaries_api.json'))
    //non-retryable error
    .get('/IDOTA2Match_570/GetMatchHistory/V001/').query(true).reply(200,
    {
        result:
        {
            error: "error"
        }
    })
    //fake full history
    .get('/IDOTA2Match_570/GetMatchHistory/V001/').query(true).reply(200, require('./history_api.json'));
//fake heroes list
//.get('/IEconDOTA2_570/GetHeroes/v0001/').query(true).reply(200, require('./heroes_api.json')
//fake leagues
//.get('/IDOTA2Match_570/GetLeagueListing/v0001/').query(true).reply(200, require('./leagues_api.json'));
//fake mmr response
nock("http://" + config.RETRIEVER_HOST).get('/?account_id=88367253').reply(200, require('./retriever_player.json'));
before(function(done)
{
    this.timeout(wait);
    async.series([
        function(cb)
        {
            console.log('removing old test database');
            pg.connect(init_db, function(err, client)
            {
                if (err)
                {
                    return cb(err);
                }
                console.log('cleaning test database', config.POSTGRES_URL);
                client.query('DROP DATABASE IF EXISTS yasp_test', function(err, result)
                {
                    cb(err);
                });
            });
        },
        function(cb)
        {
            console.log('creating test database');
            pg.connect(init_db, function(err, client)
            {
                if (err)
                {
                    return cb(err);
                }
                console.log('creation of test database', config.POSTGRES_URL);
                client.query('CREATE DATABASE yasp_test', function(err, result)
                {
                    cb(err);
                });
            });
        },
        function(cb)
        {
            console.log('connecting to test database and creating tables');
            pg.connect(config.POSTGRES_URL, function(err, client)
            {
                if (err)
                {
                    return cb(err);
                }
                // create tables
                var query = fs.readFileSync("./sql/create_tables.sql", "utf8");
                client.query(query, function(err, result)
                {
                    console.log('set up %s', config.POSTGRES_URL);
                    cb(err);
                });
            });
        },
        function(cb)
        {
            console.log("wiping redis");
            redis.flushdb(cb);
        },
        function(cb)
        {
            db = require('../store/db');
            app = require('../svc/web');
            require('../svc/parser');
            console.log("loading matches");
            async.mapSeries([details_api.result], function(m, cb)
            {
                queries.insertMatch(db, redis, m,
                {
                    type: "api",
                    skipParse: true,
                }, cb);
            }, cb);
        },
        function(cb)
        {
            console.log("loading players");
            async.mapSeries(require('./summaries_api').response.players, function(p, cb)
            {
                queries.insertPlayer(db, p, cb);
            }, cb);
        }], done);
});
describe("parser", function()
{
    this.timeout(wait);
    var tests = {
        '1781962623_source2.dem': details_api.result
    };
    for (var key in tests)
    {
        it('parse replay', function(done)
        {
            nock("http://" + config.RETRIEVER_HOST).get('/').query(true).reply(200,
            {
                match:
                {
                    cluster: 1,
                    replay_salt: key.split(".")[0].split("_")[1]
                }
            });
            //fake replay download
            nock("http://replay1.valve.net").get('/570/' + key).replyWithFile(200, replay_dir + key);
            var match = {
                match_id: tests[key].match_id,
                start_time: tests[key].start_time,
                duration: tests[key].duration,
                radiant_win: tests[key].radiant_win,
            };
            queue.addToQueue(pQueue, match,
            {}, function(err, job)
            {
                assert(job && !err);
                var poll = setInterval(function()
                {
                    pQueue.getJob(job.jobId).then(function(job)
                    {
                        job.getState().then(function(state)
                        {
                            if (state === "completed")
                            {
                                clearInterval(poll);
                                //ensure parse data got inserted
                                buildMatch(
                                {
                                    db: db,
                                    redis: redis,
                                    match_id: tests[key].match_id
                                }, function(err, match)
                                {
                                    if (err)
                                    {
                                        return done(err);
                                    }
                                    assert(match.players);
                                    assert(match.players[0]);
                                    assert(match.players[0].lh_t);
                                    assert(match.teamfights);
                                    assert(match.radiant_gold_adv);
                                    return done();
                                });
                            }
                        });
                    }).catch(done);
                }, 1000);
            });
        });
    }
});
describe("web", function()
{
    //this.timeout(wait);
    describe("main page tests", function()
    {
        var tests = Object.keys(constants.navbar_pages);
        tests.forEach(function(t)
        {
            it('/' + t, function(done)
            {
                supertest(app).get('/' + t)
                    //.expect('Content-Type', /json/)
                    //.expect('Content-Length', '20')
                    .expect(200).end(function(err, res)
                    {
                        done(err);
                    });
            });
        });
        it('/:invalid', function(done)
        {
            supertest(app).get('/asdf').expect(404).end(function(err, res)
            {
                done(err);
            });
        });
    });
    describe("player page tests", function()
    {
        var tests = Object.keys(constants.player_pages);
        tests.forEach(function(t)
        {
            it('/players/:valid/' + t, function(done)
            {
                supertest(app).get('/players/120269134/' + t).expect(200).end(function(err, res)
                {
                    done(err);
                });
            });
        });
    });
    describe("player page tests with filter", function()
    {
        var tests = Object.keys(constants.player_pages);
        tests.forEach(function(t)
        {
            it('/players/:valid/' + t, function(done)
            {
                supertest(app).get('/players/120269134/' + t + "?hero_id=1").expect(200).end(function(err, res)
                {
                    done(err);
                });
            });
        });
    });
    describe("basic match page tests", function()
    {
        it('/matches/:invalid', function(done)
        {
            supertest(app).get('/matches/1').expect(404).end(function(err, res)
            {
                done(err);
            });
        });
        //TODO test against an unparsed match to catch exceptions caused by code expecting parsed data
        it('/matches/:valid', function(done)
        {
            supertest(app).get('/matches/1781962623').expect(200).end(function(err, res)
            {
                done(err);
            });
        });
    });
    describe("parsed match page tests", function()
    {
        var tests = Object.keys(constants.match_pages);
        tests.forEach(function(t)
        {
            it('/matches/:valid_parsed/' + t, function(done)
            {
                //new RegExp(t, "i")
                supertest(app).get('/matches/1781962623/' + t).expect(200).expect(/1781962623/).end(function(err, res)
                {
                    done(err);
                });
            });
        });
    });
});
describe("api tests", function()
{
    describe("/api/items", function()
    {
        it('should 200', function(done)
        {
            supertest(app).get('/api/items').expect(200).end(function(err, res)
            {
                done(err);
            });
        });
    });
    describe("/api/abilities", function()
    {
        it('should 200', function(done)
        {
            supertest(app).get('/api/abilities').expect(200).end(function(err, res)
            {
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