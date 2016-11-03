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
const details_api = require('./data/details_api.json');
const summaries_api = require('./data/summaries_api.json');
const history_api = require('./data/history_api.json');
const heroes_api = require('./data/heroes_api.json');
const leagues_api = require('./data/leagues_api.json');
const retriever_player = require('./data/retriever_player.json');
const init_db = 'postgres://postgres:postgres@localhost/postgres';
// these are loaded later, as the database needs to be created when these are required
let db;
let cassandra;
let app;
// fake api responses
nock('http://api.steampowered.com')
  // fake 500 error
  .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).reply(500, {})
  // fake match details
  .get('/IDOTA2Match_570/GetMatchDetails/V001/').query(true).times(10).reply(200, details_api)
  // fake player summaries
  .get('/ISteamUser/GetPlayerSummaries/v0002/').query(true).reply(200, summaries_api)
  // fake full history
  .get('/IDOTA2Match_570/GetMatchHistory/V001/').query(true).reply(200, history_api)
  // fake heroes list
  .get('/IEconDOTA2_570/GetHeroes/v0001/').query(true).reply(200, heroes_api)
  // fake leagues
  .get('/IDOTA2Match_570/GetLeagueListing/v0001/').query(true).reply(200, leagues_api);
// fake mmr response
nock(`http://${config.RETRIEVER_HOST}`).get('/?account_id=88367253').reply(200, retriever_player);
before(function setup(done) {
  this.timeout(30000);
  async.series([
    function (cb) {
      pg.connect(init_db, (err, client) => {
        if (err) {
          return cb(err);
        }
        async.series([
          function (cb) {
            console.log('drop postgres test database');
            client.query('DROP DATABASE IF EXISTS yasp_test', cb);
          },
          function (cb) {
            console.log('create postgres test database');
            client.query('CREATE DATABASE yasp_test', cb);
          },
          function (cb) {
            console.log('connecting to test database and creating tables');
            db = require('../store/db');
            const query = fs.readFileSync('./sql/create_tables.sql', 'utf8');
            db.raw(query).asCallback(cb);
          },
        ], cb);
      });
    },
    function (cb) {
      const client = new cass.Client({
        contactPoints: ['localhost'],
      });
      async.series([function (cb) {
        console.log('drop cassandra test keyspace');
        client.execute('DROP KEYSPACE IF EXISTS yasp_test', cb);
      },
        function (cb) {
          console.log('create cassandra test keyspace');
          client.execute('CREATE KEYSPACE yasp_test WITH REPLICATION = { \'class\': \'NetworkTopologyStrategy\', \'datacenter1\': 1 };', cb);
        },
        function (cb) {
          cassandra = require('../store/cassandra');
          console.log('create cassandra test tables');
          async.eachSeries(fs.readFileSync('./sql/create_tables.cql', 'utf8').split(';').filter((cql) => {
            return cql.length > 1;
          }), (cql, cb) => {
            cassandra.execute(cql, cb);
          }, cb);
        },
      ], cb);
    },
    function (cb) {
      console.log('wiping redis');
      redis.flushdb((err, success) => {
        console.log(err, success);
        cb(err);
      });
    },
    function (cb) {
      console.log('loading matches');
      async.mapSeries([details_api.result], (m, cb) => {
        queries.insertMatch(m, {
          type: 'api',
          skipParse: true,
        }, cb);
      }, cb);
    },
    function (cb) {
      console.log('loading players');
      async.mapSeries(summaries_api.response.players, (p, cb) => {
        queries.insertPlayer(db, p, cb);
      }, cb);
    },
    function (cb) {
      console.log('starting services');
      app = require('../svc/web');
      require('../svc/parser');
      cb();
    },
  ], done);
});
describe('replay parse', function () {
  this.timeout(120000);
  const tests = {
    '1781962623_1.dem': details_api.result,
  };
  Object.keys(tests).forEach((key) => {
    const match = tests[key];
    nock(`http://${config.RETRIEVER_HOST}`).get('/').query(true).reply(200, {
      match: {
        match_id: match.match_id,
        cluster: match.cluster,
        replay_salt: 1,
        series_id: 0,
        series_type: 0,
        players: [],
      },
    });
    nock(`http://replay${match.cluster}.valve.net`).get(`/570/${key}`).reply(200, (uri, requestBody, cb) => {
      request(`https://cdn.rawgit.com/odota/testfiles/master/${key}`, {
        encoding: null,
      }, (err, resp, body) => {
        return cb(err, body);
      });
    });
    it(`parse replay ${key}`, (done) => {
      queries.insertMatch(match, {
        cassandra,
        type: 'api',
        forceParse: true,
        attempts: 1,
      }, (err, job) => {
        assert(job && !err);
        const poll = setInterval(() => {
          pQueue.getJob(job.jobId).then((job) => {
            job.getState().then((state) => {
              if (state === 'completed') {
                clearInterval(poll);
                // ensure parse data got inserted
                buildMatch(tests[key].match_id, {
                  db,
                  redis,
                }, (err, match) => {
                  if (err) {
                    return done(err);
                  }
                  assert(match.players);
                  assert(match.players[0]);
                  assert(match.players[0].lh_t);
                  assert(match.teamfights);
                  assert(match.radiant_gold_adv);
                  return done();
                });
              } else {
                console.log(job.jobId, state, job.stacktrace);
              }
            });
          }).catch(done);
        }, 1000);
      });
    });
  });
});
describe('player pages', function () {
  this.timeout(5000);
  const tests = Object.keys(constants.player_pages);
  tests.forEach((t) => {
    it(`/players/:valid/${t}`, (done) => {
      supertest(app).get(`/players/120269134/${t}`).expect(200).end((err, res) => {
        done(err);
      });
    });
  });
});
describe('player pages with filter', () => {
  const tests = Object.keys(constants.player_pages);
  tests.forEach((t) => {
    it(`/players/:valid/${t}`, (done) => {
      supertest(app).get(`/players/120269134/${t}?hero_id=1`).expect(200).end((err, res) => {
        done(err);
      });
    });
  });
});
describe('basic match page', () => {
  it('/matches/:invalid', (done) => {
    supertest(app).get('/matches/1').expect(404).end((err, res) => {
      done(err);
    });
  });
  it('/matches/:valid', (done) => {
    supertest(app).get('/matches/1781962623').expect(200).end((err, res) => {
      done(err);
    });
  });
});
// TODO test against an unparsed match to catch exceptions caused by code expecting parsed data
describe('api', () => {
  it('should accept api endpoints', (cb) => {
    request('https://raw.githubusercontent.com/odota/docs/master/openapi.json', (err, resp, body) => {
      if (err) {
        return cb(err);
      }
      body = JSON.parse(body);
      async.eachSeries(Object.keys(body.paths), (path, cb) => {
        supertest(app).get(`/api${path.replace(/{.*}/, 1)}`).end((err, res) => {
          console.log(path, res.length);
          return cb(err);
        });
      }, cb);
    });
  });
});
describe('generateMatchups', () => {
  it('should generate matchups', (done) => {
    // in this sample match
    // 1,6,52,59,105:46,73,75,100,104:1
    // dire:radiant, radiant won
    const keys = utility.generateMatchups(details_api.result, 5);
    const combs5 = Math.pow(1 + 5 + 10 + 10 + 5 + 1, 2); // sum of 5cN for n from 0 to 5, squared to account for all pairwise matchups between both teams
    assert.equal(keys.length, combs5);
    keys.forEach((k) => {
      redis.hincrby('matchups', k, 1);
    });
    async.series([
      function zeroVzero(cb) {
        supertest(app).get('/api/matchups').expect(200).end((err, res) => {
          assert.equal(res.body.t0, 1);
          assert.equal(res.body.t1, 0);
          cb(err);
        });
      },
      function oneVzeroRight(cb) {
        supertest(app).get('/api/matchups?t1=1').expect(200).end((err, res) => {
          assert.equal(res.body.t0, 1);
          assert.equal(res.body.t1, 0);
          cb(err);
        });
      },
      function oneVzero(cb) {
        supertest(app).get('/api/matchups?t0=1').expect(200).end((err, res) => {
          assert.equal(res.body.t0, 0);
          assert.equal(res.body.t1, 1);
          cb(err);
        });
      },
      function oneVzero2(cb) {
        supertest(app).get('/api/matchups?t0=6').expect(200).end((err, res) => {
          assert.equal(res.body.t0, 0);
          assert.equal(res.body.t1, 1);
          cb(err);
        });
      },
      function oneVzero3(cb) {
        supertest(app).get('/api/matchups?t0=46').expect(200).end((err, res) => {
          assert.equal(res.body.t0, 1);
          assert.equal(res.body.t1, 0);
          cb(err);
        });
      },
      function oneVone(cb) {
        supertest(app).get('/api/matchups?t0=1&t1=46').expect(200).end((err, res) => {
          assert.equal(res.body.t0, 0);
          assert.equal(res.body.t1, 1);
          cb(err);
        });
      },
      function oneVoneInvert(cb) {
        supertest(app).get('/api/matchups?t0=46&t1=1').expect(200).end((err, res) => {
          assert.equal(res.body.t0, 1);
          assert.equal(res.body.t1, 0);
          cb(err);
        });
      },
    ], done);
  });
});
