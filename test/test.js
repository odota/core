/**
 * Main test script to run tests
 **/
process.env.NODE_ENV = 'test';
const async = require('async');
const nock = require('nock');
const assert = require('assert');
const supertest = require('supertest');
const pg = require('pg');
const cass = require('cassandra-driver');
const fs = require('fs');
const request = require('request');
const config = require('../config');
const constants = require('dotaconstants');
const redis = require('../store/redis');
const queue = require('../store/queue');
const queries = require('../store/queries');
const pQueue = queue.getQueue('parse');
const buildMatch = require('../store/buildMatch');
const utility = require('../util/utility');
const details_api = require('./details_api.json');
const init_db = "postgres://postgres:postgres@localhost/postgres";
const wait = 90000;
// these are loaded later, as the database needs to be created when these are required
var db;
var cassandra;
var app;
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
before(function setup(done)
{
    this.timeout(wait);
    async.series([
        function (cb)
        {
            pg.connect(init_db, function (err, client)
            {
                if (err)
                {
                    return cb(err);
                }
                async.series([
                    function (cb)
                    {
                        console.log('drop postgres test database');
                        client.query('DROP DATABASE IF EXISTS yasp_test', cb);
                    },
                    function (cb)
                    {
                        console.log('create postgres test database');
                        client.query('CREATE DATABASE yasp_test', cb);
                    },
                    function (cb)
                    {
                        console.log('connecting to test database and creating tables');
                        db = require('../store/db');
                        var query = fs.readFileSync("./sql/create_tables.sql", "utf8");
                        db.raw(query).asCallback(cb);
                    },
                ], cb);
            });
        },
        function (cb)
        {
            const client = new cass.Client(
            {
                contactPoints: ['localhost']
            });
            async.series([function (cb)
                {
                    console.log('drop cassandra test keyspace');
                    client.execute('DROP KEYSPACE IF EXISTS yasp_test', cb);
                },
                function (cb)
                {
                    console.log('create cassandra test keyspace');
                    client.execute(`CREATE KEYSPACE yasp_test WITH REPLICATION = { 'class': 'NetworkTopologyStrategy', 'datacenter1': 1 };`, cb);
                },
                function (cb)
                {
                    cassandra = require('../store/cassandra');
                    console.log('create cassandra test tables');
                    async.eachSeries(fs.readFileSync('./sql/create_tables.cql', "utf8").split(';').filter(function (cql)
                    {
                        return cql.length > 1;
                    }), function (cql, cb)
                    {
                        cassandra.execute(cql, cb);
                    }, cb);
                }
            ], cb);
        },
        function (cb)
        {
            console.log("wiping redis");
            redis.flushdb(cb);
        },
        function (cb)
        {
            console.log("loading matches");
            async.mapSeries([details_api.result], function (m, cb)
            {
                queries.insertMatch(db, redis, m,
                {
                    cassandra: cassandra,
                    type: "api",
                    skipParse: true,
                }, cb);
            }, cb);
        },
        function (cb)
        {
            console.log("loading players");
            async.mapSeries(require('./summaries_api').response.players, function (p, cb)
            {
                queries.insertPlayer(db, p, cb);
            }, cb);
        },
        function (cb)
        {
            console.log('starting services');
            app = require('../svc/web');
            require('../svc/parser');
            cb();
        },
    ], done);
});
describe("replay parse", function ()
{
    this.timeout(wait);
    var tests = {
        '1781962623_1.dem': details_api.result
    };
    for (var key in tests)
    {
        it('parse replay ' + key, function (done)
        {
            nock("http://" + config.RETRIEVER_HOST).get('/').query(true).reply(200,
            {
                match:
                {
                    match_id: 1781962623,
                    cluster: 1,
                    replay_salt: 1,
                    series_id: 0,
                    series_type: 0,
                    players: [],
                }
            });
            nock("http://replay1.valve.net").get('/570/' + key).reply(200, function (uri, requestBody, cb)
            {
                request('https://github.com/yasp-dota/testfiles/raw/master/1781962623_1.dem',
                {
                    encoding: null
                }, function (err, resp, body)
                {
                    return cb(err, body);
                });
            });
            var match = {
                match_id: tests[key].match_id,
                start_time: tests[key].start_time,
                duration: tests[key].duration,
                radiant_win: tests[key].radiant_win,
            };
            queue.addToQueue(pQueue, match,
            {}, function (err, job)
            {
                assert(job && !err);
                var poll = setInterval(function ()
                {
                    pQueue.getJob(job.jobId).then(function (job)
                    {
                        job.getState().then(function (state)
                        {
                            if (state === "completed")
                            {
                                clearInterval(poll);
                                //ensure parse data got inserted
                                buildMatch(tests[key].match_id,
                                {
                                    db: db,
                                    redis: redis,
                                }, function (err, match)
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
//this.timeout(wait);
describe("player pages", function ()
{
    var tests = Object.keys(constants.player_pages);
    tests.forEach(function (t)
    {
        it('/players/:valid/' + t, function (done)
        {
            supertest(app).get('/players/120269134/' + t).expect(200).end(function (err, res)
            {
                done(err);
            });
        });
    });
});
describe("player pages with filter", function ()
{
    var tests = Object.keys(constants.player_pages);
    tests.forEach(function (t)
    {
        it('/players/:valid/' + t, function (done)
        {
            supertest(app).get('/players/120269134/' + t + "?hero_id=1").expect(200).end(function (err, res)
            {
                done(err);
            });
        });
    });
});
describe("basic match page", function ()
{
    it('/matches/:invalid', function (done)
    {
        supertest(app).get('/matches/1').expect(404).end(function (err, res)
        {
            done(err);
        });
    });
    //TODO test against an unparsed match to catch exceptions caused by code expecting parsed data
    it('/matches/:valid', function (done)
    {
        supertest(app).get('/matches/1781962623').expect(200).end(function (err, res)
        {
            done(err);
        });
    });
});
describe("parsed match page", function ()
{
    var tests = Object.keys(constants.match_pages);
    tests.forEach(function (t)
    {
        it('/matches/:valid_parsed/' + t, function (done)
        {
            //new RegExp(t, "i")
            supertest(app).get('/matches/1781962623/' + t).expect(200).expect(/1781962623/).end(function (err, res)
            {
                done(err);
            });
        });
    });
});
describe('api', function ()
{
    it('should accept api endpoints', function (cb)
    {
        request('https://raw.githubusercontent.com/yasp-dota/api/gh-pages/openapi.json', function (err, resp, body)
        {
            if (err)
            {
                return cb(err);
            }
            body = JSON.parse(body);
            async.eachSeries(Object.keys(body.paths), function (path, cb)
            {
                supertest(app).get('/api' + path.replace(/{.*}/, 1)).end(function (err, res)
                {
                    console.log(path, res.length);
                    return cb(err);
                });
            }, cb);
        });
    });
});
describe('generateMatchups', function ()
{
    it('should generate matchups', function (done)
    {
        //in this sample match
        //1,6,52,59,105:46,73,75,100,104:1
        //dire:radiant, radiant won
        var keys = utility.generateMatchups(details_api.result, 5);
        var combs5 = Math.pow(1 + 5 + 10 + 10 + 5 + 1, 2); //sum of 5cN for n from 0 to 5, squared to account for all pairwise matchups between both teams
        assert.equal(keys.length, combs5);
        keys.forEach(function (k)
        {
            redis.hincrby('matchups', k, 1);
        });
        async.series([
            function zeroVzero(cb)
            {
                supertest(app).get('/api/matchups').expect(200).end(function (err, res)
                {
                    assert.equal(res.body.t0, 1);
                    assert.equal(res.body.t1, 0);
                    cb(err);
                });
            },
            function oneVzeroRight(cb)
            {
                supertest(app).get('/api/matchups?t1=1').expect(200).end(function (err, res)
                {
                    assert.equal(res.body.t0, 1);
                    assert.equal(res.body.t1, 0);
                    cb(err);
                });
            },
            function oneVzero(cb)
            {
                supertest(app).get('/api/matchups?t0=1').expect(200).end(function (err, res)
                {
                    assert.equal(res.body.t0, 0);
                    assert.equal(res.body.t1, 1);
                    cb(err);
                });
            },
            function oneVzero2(cb)
            {
                supertest(app).get('/api/matchups?t0=6').expect(200).end(function (err, res)
                {
                    assert.equal(res.body.t0, 0);
                    assert.equal(res.body.t1, 1);
                    cb(err);
                });
            },
            function oneVzero3(cb)
            {
                supertest(app).get('/api/matchups?t0=46').expect(200).end(function (err, res)
                {
                    assert.equal(res.body.t0, 1);
                    assert.equal(res.body.t1, 0);
                    cb(err);
                });
            },
            function oneVone(cb)
            {
                supertest(app).get('/api/matchups?t0=1&t1=46').expect(200).end(function (err, res)
                {
                    assert.equal(res.body.t0, 0);
                    assert.equal(res.body.t1, 1);
                    cb(err);
                });
            },
            function oneVoneInvert(cb)
            {
                supertest(app).get('/api/matchups?t0=46&t1=1').expect(200).end(function (err, res)
                {
                    assert.equal(res.body.t0, 1);
                    assert.equal(res.body.t1, 0);
                    cb(err);
                });
            },
        ], done);
    });
});
