var config = require('../config');
config.PORT = ""; //use service defaults
config.MONGO_URL = "mongodb://localhost/test";
config.POSTGRES_URL = "postgres://yasp_test:yasp_test@localhost/yasp_test";
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
var constants = require('../constants.js');
var init_db = "postgres://postgres:postgres@localhost/postgres";
/*
var processApi = require('../processApi');
var processFullHistory = require('../processFullHistory');
var processMmr = require('../processMmr');
*/
var queueReq = require('../utility').queueReq;
var supertest = require('supertest');
var replay_dir = "./test/testfiles/";
var pg = require('pg');
var fs = require('fs');
var wait = 90000;
// these are loaded later, as the database needs to be created when these are required
var db;
var app;
var queries = require('../queries');
//nock.disableNetConnect();
//nock.enableNetConnect();
//fake api response
nock('http://api.steampowered.com')
    //500 error
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).reply(500,
    {})
    //fake match details
    .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).times(10).reply(200, require('./details_api.json'))
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
//TODO page 2 for fullhistory?
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
                client.query('DROP ROLE IF EXISTS yasp_test;', function(err, result)
                {
                    console.log('cleaning database role for testing');
                });
                client.query('DROP DATABASE IF EXISTS yasp_test;', function(err, result)
                {
                    console.log('cleaning test database', config.POSTGRES_URL);
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
                client.query('CREATE ROLE yasp_test WITH LOGIN PASSWORD \'yasp_test\';', function(err, result)
                {
                    console.log('creation of database role for testing');
                });
                client.query('CREATE DATABASE yasp_test OWNER yasp_test;', function(err, result)
                {
                    console.log('creation of test database', config.POSTGRES_URL);
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
            db = require('../db');
            app = require('../web');
            require('../parser');
            console.log("loading matches");
            async.mapSeries([require('./details_api.json').result], function(m, cb)
            {
                queries.insertMatch(db, redis, queue, m,
                {
                    type: "api"
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
describe("worker", function()
{
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
describe("parser", function()
{
    this.timeout(wait);
    var tests = {
        '1781962623_source2.dem': 1781962623
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
                match_id: tests[key],
                start_time: moment().format('X'),
                slot_to_id:
                {}
            };
            queueReq(queue, "parse", match,
            {}, function(err, job)
            {
                assert(job && !err);
                queue.parse.once('completed', function(job2)
                {
                    if (job.jobId === job2.jobId)
                    {
                        //ensure parse data got inserted
                        queries.getMatch(db, tests[key], function(err, match)
                        {
                            if (err)
                            {
                                return done(err);
                            }
                            assert(match.version);
                            assert(match.players && match.players[0] && match.players.lh_t);
                            return done();
                        });
                    }
                });
            });
        });
    }
});
describe("web", function()
{
    //this.timeout(wait);
    describe("main page tests", function()
    {
        it('/', function(done)
        {
            supertest(app).get('/')
                //.expect('Content-Type', /json/)
                //.expect('Content-Length', '20')
                .expect(200).end(function(err, res)
                {
                    done(err);
                });
        });
        it('/distributions', function(done)
        {
            supertest(app).get('/distributions').expect(200).end(function(err, res)
            {
                done(err);
            });
        });
        it('/mmstats', function(done)
        {
            supertest(app).get('/mmstats').expect(200).end(function(err, res)
            {
                done(err);
            });
        });
        it('/status', function(done)
        {
            supertest(app).get('/status').expect(200).expect(/Status/).end(function(err, res)
            {
                done(err);
            });
        });
        it('/faq', function(done)
        {
            supertest(app).get('/faq').expect(200).expect(/FAQ/).end(function(err, res)
            {
                done(err);
            });
        });
        it('/carry', function(done)
        {
            supertest(app).get('/carry').expect(200).expect(/Carry/).end(function(err, res)
            {
                done(err);
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
    describe("basic match page tests", function()
    {
        it('/matches/:invalid', function(done)
        {
            supertest(app).get('/matches/1').expect(500).end(function(err, res)
            {
                done(err);
            });
        });
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