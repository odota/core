/* global before describe it */
/* eslint-disable global-require */
/**
 * Main test script to run tests
 * */
process.env.NODE_ENV = 'test';
const async = require('async');
const nock = require('nock');
const assert = require('assert');
const supertest = require('supertest');
const pg = require('pg');
const fs = require('fs');
const cassandraDriver = require('cassandra-driver');
const config = require('../config');
const redis = require('../store/redis');
// const utility = require('../util/utility');
const detailsApi = require('./data/details_api.json');
const summariesApi = require('./data/summaries_api.json');
const historyApi = require('./data/history_api.json');
const heroesApi = require('./data/heroes_api.json');
const leaguesApi = require('./data/leagues_api.json');
const retrieverPlayer = require('./data/retriever_player.json');
const detailsApiPro = require('./data/details_api_pro.json');

const initPostgresHost = `postgres://postgres:postgres@${config.INIT_POSTGRES_HOST}/postgres`;
const initCassandraHost = config.INIT_CASSANDRA_HOST;
// these are loaded later, as the database needs to be created when these are required
let db;
let cassandra;
let app;
let queries;
let buildMatch;
// fake api responses
nock('http://api.steampowered.com')
  // fake 500 error
  .get('/IDOTA2Match_570/GetMatchDetails/V001/')
  .query(true)
  .reply(500, {})
  // fake match details
  .get('/IDOTA2Match_570/GetMatchDetails/V001/')
  .query(true)
  .times(10)
  .reply(200, detailsApi)
  // fake player summaries
  .get('/ISteamUser/GetPlayerSummaries/v0002/')
  .query(true)
  .reply(200, summariesApi)
  // fake full history
  .get('/IDOTA2Match_570/GetMatchHistory/V001/')
  .query(true)
  .reply(200, historyApi)
  // fake heroes list
  .get('/IEconDOTA2_570/GetHeroes/v0001/')
  .query(true)
  .reply(200, heroesApi)
  // fake leagues
  .get('/IDOTA2Match_570/GetLeagueListing/v0001/')
  .query(true)
  .reply(200, leaguesApi);
// fake mmr response
nock(`http://${config.RETRIEVER_HOST}`)
  .get('/?account_id=88367253')
  .reply(200, retrieverPlayer);
before(function setup(done) {
  this.timeout(30000);
  async.series([
    function initPostgres(cb) {
      pg.connect(initPostgresHost, (err, client) => {
        if (err) {
          return cb(err);
        }
        return async.series([
          function drop(cb) {
            console.log('drop postgres test database');
            client.query('DROP DATABASE IF EXISTS yasp_test', cb);
          },
          function create(cb) {
            console.log('create postgres test database');
            client.query('CREATE DATABASE yasp_test', cb);
          },
          function tables(cb) {
            db = require('../store/db');
            console.log('connecting to test database and creating tables');
            const query = fs.readFileSync('./sql/create_tables.sql', 'utf8');
            db.raw(query).asCallback(cb);
          },
          function setup(cb) {
            // populate the DB with this leagueid so we insert a pro match
            db.raw('INSERT INTO leagues(leagueid, tier) VALUES(5399, \'professional\')').asCallback(cb);
          },
        ], cb);
      });
    },
    function initCassandra(cb) {
      const client = new cassandraDriver.Client({
        contactPoints: [initCassandraHost],
      });
      async.series([function drop(cb) {
        console.log('drop cassandra test keyspace');
        client.execute('DROP KEYSPACE IF EXISTS yasp_test', cb);
      },
      function create(cb) {
        console.log('create cassandra test keyspace');
        client.execute('CREATE KEYSPACE yasp_test WITH REPLICATION = { \'class\': \'NetworkTopologyStrategy\', \'datacenter1\': 1 };', cb);
      },
      function tables(cb) {
        cassandra = require('../store/cassandra');
        console.log('create cassandra test tables');
        async.eachSeries(fs.readFileSync('./sql/create_tables.cql', 'utf8').split(';').filter(cql =>
          cql.length > 1), (cql, cb) => {
          cassandra.execute(cql, cb);
        }, cb);
      },
      ], cb);
    },
    function wipeRedis(cb) {
      console.log('wiping redis');
      redis.flushdb((err, success) => {
        console.log(err, success);
        cb(err);
      });
    },
    function startServices(cb) {
      console.log('starting services');
      app = require('../svc/web');
      queries = require('../store/queries');
      buildMatch = require('../store/buildMatch');
      require('../svc/parser');
      cb();
    },
    function loadMatches(cb) {
      console.log('loading matches');
      async.mapSeries([detailsApi.result, detailsApiPro.result, detailsApiPro.result], (m, cb) => {
        queries.insertMatch(m, {
          type: 'api',
          origin: 'scanner',
          skipParse: true,
        }, cb);
      }, cb);
    },
    function loadPlayers(cb) {
      console.log('loading players');
      async.mapSeries(summariesApi.response.players, (p, cb) => {
        queries.insertPlayer(db, p, cb);
      }, cb);
    },
  ], done);
});
describe('replay parse', function testReplayParse() {
  this.timeout(120000);
  const tests = {
    '1781962623_1.dem': detailsApi.result,
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
    it(`should parse replay ${key}`, (done) => {
      queries.insertMatch(match, {
        cassandra,
        type: 'api',
        forceParse: true,
        attempts: 1,
      }, (err, job) => {
        assert(job && !err);
        setTimeout(() => {
          // ensure parse data got inserted
          buildMatch(tests[key].match_id, (err, match) => {
            if (err) {
              return done(err);
            }
            console.log(match.players[0]);
            assert(match.players);
            assert(match.players[0]);
            assert(match.players[0].killed.npc_dota_creep_badguys_melee === 46);
            assert(match.players[0].lh_t && match.players[0].lh_t.length > 0);
            assert(match.teamfights && match.teamfights.length > 0);
            assert(match.radiant_gold_adv && match.radiant_gold_adv.length > 0);
            return done();
          });
        }, 30000);
      });
    });
  });
});
describe('teamRanking', () => {
  it('should have team rankings', (cb) => {
    db.select(['team_id', 'rating', 'wins', 'losses']).from('team_rating').asCallback((err, rows) => {
      // We inserted the pro match twice so expect to update the ratings twice
      const loser = rows.find(row => row.team_id === 4251435);
      const winner = rows.find(row => row.team_id === 1375614);
      console.log(loser.rating, winner.rating);
      assert(loser.losses === 2);
      assert(winner.wins === 2);
      assert(loser.rating < winner.rating);
      return cb(err);
    });
  });
});
// TODO test against an unparsed match to catch exceptions caused by code expecting parsed data
describe('api', () => {
  it('should get API spec', (cb) => {
    supertest(app).get('/api').end((err, res) => {
      if (err) {
        return cb(err);
      }
      const spec = res.body;
      return async.eachSeries(Object.keys(spec.paths), (path, cb) => {
        const replacedPath = path
          .replace(/{match_id}/, 1781962623)
          .replace(/{account_id}/, 120269134)
          .replace(/{field}/, 'kills');
        async.eachSeries(Object.keys(spec.paths[path]), (verb, cb) => {
          if (path.indexOf('/explorer') === 0 || path.indexOf('/request') === 0) {
            return cb(err);
          }
          return supertest(app)[verb](`/api${replacedPath}?q=testsearch`).end((err, res) => {
            // console.log(verb, replacedPath, res.body);
            assert.equal(res.statusCode, 200);
            return cb(err);
          });
        }, cb);
      }, cb);
    });
  });
});
/*
describe('generateMatchups', () => {
  it('should generate matchups', (done) => {
    // in this sample match
    // 1,6,52,59,105:46,73,75,100,104:1
    // dire:radiant, radiant won
    const keys = utility.generateMatchups(detailsApi.result, 5);
    // sum of 5cN for n from 0 to 5, squared to account for all pairwise matchups
    const combs5 = (1 + 5 + 10 + 10 + 5 + 1) ** 2;
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
*/
