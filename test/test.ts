/* global before describe it beforeEach after */
/**
 * Main test script to run tests
 * */
process.env.NODE_ENV = 'test';
import type { Express } from 'express';
import nock from 'nock';
import assert from 'assert';
import supertest from 'supertest';
import stripeLib from 'stripe';
import pg from 'pg';
import { readFileSync } from 'fs';
import util from 'util';
import url from 'url';
import { Client } from 'cassandra-driver';
import swaggerParser from '@apidevtools/swagger-parser';
import config from '../config.js';
import detailsApi from './data/details_api.json';
import summariesApi from './data/summaries_api.json';
import historyApi from './data/history_api.json';
import heroesApi from './data/heroes_api.json';
import leaguesApi from './data/leagues_api.json';
import retrieverPlayer from './data/retriever_player.json';
import detailsApiPro from './data/details_api_pro.json';
import retrieverMatch from './data/retriever_match.json';
import spec from '../routes/spec';
import {
  getPlayerMatchesPromise,
  insertMatch,
  upsertPlayer,
} from '../store/queries';
import buildMatch from '../store/buildMatch';
import { es } from '../store/elasticsearch';
import redis from '../store/redis';
import db from '../store/db';
import cassandra from '../store/cassandra.js';
import c from 'ansi-colors';

const { Pool } = pg;
const {
  RETRIEVER_HOST,
  STRIPE_SECRET,
  POSTGRES_URL,
  CASSANDRA_URL,
  SCYLLA_URL,
} = config;
const initPostgresHost = POSTGRES_URL.replace('/yasp_test', '/postgres');
const initCassandraHost = url.parse(CASSANDRA_URL).host as string;
const initScyllaHost = url.parse(SCYLLA_URL).host as string;

let app: Express;
// fake api responses
nock('http://api.steampowered.com')
  // fake 500 error to test error handling
  .get('/IDOTA2Match_570/GetMatchDetails/V001/')
  .query(true)
  .reply(500, {})
  // fake match details
  .get('/IDOTA2Match_570/GetMatchDetails/V001/')
  .query(true)
  // Once on insert call and once during parse processor
  .times(2)
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
nock(`http://${RETRIEVER_HOST}`)
  .get(/\?key=&account_id=.*/)
  // fake mmr response up to 7 times for 7 non-anonymous players in test match
  .times(7)
  .reply(200, retrieverPlayer)
  // fake GC match details
  .get('/?key=&match_id=1781962623')
  .reply(200, retrieverMatch);
before(async function setup() {
  this.timeout(60000);
  config.ENABLE_RANDOM_MMR_UPDATE = '1';
  await initPostgres();
  await initElasticsearch();
  await initRedis();
  await initCassandra();
  await initScylla();
  await startServices();
  await loadMatches();
  await loadPlayers();
});
describe(c.blue('[TEST] swagger schema'), async function testSwaggerSchema() {
  this.timeout(2000);
  it('should be valid', (cb) => {
    const validOpts = {
      validate: {
        schema: true,
        spec: true,
      },
    };
    // We stringify and imediately parse the object in order to remove the route() and func() properties, which arent a part of the OpenAPI spec
    swaggerParser.validate(JSON.parse(JSON.stringify(spec)), validOpts, cb);
  });
});
describe(c.blue('[TEST] player_caches'), async () => {
  // Test fetching matches for first player
  let data = null;
  before(async () => {
    data = await getPlayerMatchesPromise('120269134', {
      project: ['match_id'],
    });
  });
  it('should have one row in player_caches', async () => {
    assert.equal(data.length, 1);
  });
});
describe(c.blue('[TEST] players'), async () => {
  let data: any = null;
  before(async () => {
    const res = await supertest(app).get('/api/players/120269134');
    data = res.body;
  });
  it('should have profile data', async () => {
    assert.equal(data.profile.account_id, 120269134);
    assert.ok(data.profile.personaname);
  });
  it('should have rank_tier data', async () => {
    assert.equal(data.rank_tier, 80);
  });
  it('should return 404 for nonexistent player', async () => {
    const res = await supertest(app).get('/api/players/666');
    assert.equal(res.statusCode, 404);
  });
});
describe(c.blue('[TEST] replay parse'), async function () {
  this.timeout(120000);
  const tests: AnyDict = {
    '1781962623_1.dem': detailsApi.result,
  };
  const key = Object.keys(tests)[0];
  before(async () => {
    const matchData = tests[key];
    // This match is not a pro match, but we set the leagueid to 5399 so we get data in postgres
    // We could do this with a real pro match but we'd have to upload a new replay file
    console.log('inserting and parsing match');
    const job = await insertMatch(matchData, {
      type: 'api',
      forceParse: true,
      attempts: 1,
    });
    assert.ok(job);
    console.log('waiting for replay parse');
    await new Promise((resolve) => setTimeout(resolve, 20000));
  });
  it('should have api data in buildMatch', async () => {
    // ensure api data got inserted
    const match = await buildMatch(tests[key].match_id.toString(), {});
    assert.ok(match.players);
    assert.ok(match.players[0]);
    assert.equal(match.players[0].kills, 8);
    assert.ok(match.start_time);
  });
  it('should have gcdata in buildMatch', async () => {
    // ensure gcdata got inserted
    const match = await buildMatch(tests[key].match_id.toString(), {});
    assert.ok(match.players);
    assert.ok(match.players[0]);
    assert.equal(match.players[0].party_size, 10);
    assert.equal(match.replay_salt, 1);
  });
  it('should have parse data in buildMatch', async () => {
    // ensure parse data got inserted
    const match = await buildMatch(tests[key].match_id.toString(), {});
    assert.ok(match.players);
    assert.ok(match.players[0]);
    assert.equal(match.players[0].killed.npc_dota_creep_badguys_melee, 46);
    assert.ok(match.players[0].lh_t);
    assert.ok(match.players[0].lh_t.length);
    assert.ok(match.teamfights);
    assert.ok(match.teamfights.length);
    assert.ok(match.draft_timings);
    assert.ok(match.radiant_gold_adv);
    assert.ok(match.radiant_gold_adv.length);
  });
  it('should have parse match data in postgres', async () => {
    // Assert that the pro data (with parsed info) is in postgres
    const proMatch = await db.raw('select * from matches where match_id = ?', [
      tests[key].match_id,
    ]);
    const proMatchPlayers = await db.raw(
      'select * from player_matches where match_id = ?',
      [tests[key].match_id],
    );
    const picksBans = await db.raw('select * from picks_bans');
    const teamMatch = await db.raw('select * from team_match');
    const teamRankings = await db.raw('select * from team_rating');
    // console.log(proMatch.rows, proMatchPlayers.rows[0], picksBans.rows, teamMatch.rows, teamRankings.rows);
    assert.ok(proMatch.rows.length);
    assert.ok(proMatch.rows[0].chat);
    assert.equal(proMatchPlayers.rows.length, 10);
    assert.ok(proMatchPlayers.rows[0].killed);
    assert.equal(picksBans.rows.length, 20);
    assert.equal(teamMatch.rows.length, 2);
    assert.equal(teamRankings.rows.length, 2);
  });
  it('should have parse data for non-anonymous players in player_caches', async () => {
    const result = await cassandra.execute(
      'SELECT * from player_caches WHERE match_id = 1781962623 ALLOW FILTERING',
    );
    // Assert that parsed data is in player_caches
    assert.ok(result.rows[0].stuns);

    // Assert that gc data is in player_caches
    assert.ok(result.rows[0].party_size);

    // There should be 7 rows in player_caches for this match since there are 3 anonymous players
    assert.equal(result.rows.length, 7);
  });
});
describe(c.blue('[TEST] teamRanking'), () => {
  it('should have team rankings', async () => {
    const rows = await db
      .select(['team_id', 'rating', 'wins', 'losses'])
      .from('team_rating');
    // We inserted the pro match twice so expect to update the ratings twice
    const loser = rows.find((row) => row.team_id === 4251435);
    const winner = rows.find((row) => row.team_id === 1375614);
    console.log(loser.rating, winner.rating);
    assert(loser.losses === 2);
    assert(winner.wins === 2);
    assert(loser.rating < winner.rating);
  });
});
describe(c.blue('[TEST] api routes'), async function () {
  this.timeout(5000);
  before(async () => {
    const tests: string[][] = [];
    console.log('getting API spec and setting up tests');
    const res = await supertest(app).get('/api');
    const spec = res.body;
    Object.keys(spec.paths).forEach((path) => {
      Object.keys(spec.paths[path]).forEach((verb) => {
        const replacedPath = path
          .replace(/{match_id}/, '1781962623')
          .replace(/{account_id}/, '120269134')
          .replace(/{team_id}/, '15')
          .replace(/{hero_id}/, '1')
          .replace(/{league_id}/, '1')
          .replace(/{field}/, 'kills')
          .replace(/{resource}/, 'heroes');
        tests.push([path, verb, replacedPath]);
        if (path.includes('{match_id}')) {
          // Also test an unparsed match ID
          tests.push([path, verb, path.replace(/{match_id}/, '3254426673')]);
        }
      });
    });
    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      const [path, verb, replacedPath] = test;
      if (path.indexOf('/explorer') === 0 || path.indexOf('/request') === 0) {
        continue;
      }
      const newTest = it(`should visit ${replacedPath}`, async () => {
        const res = await supertest(app)[verb as HttpVerb](
          `/api${replacedPath}?q=testsearch`,
        );
        if (res.statusCode !== 200) {
          console.error(verb, replacedPath, res.body);
        }
        if (replacedPath.startsWith('/admin')) {
          assert.equal(res.statusCode, 403);
        } else if (replacedPath.startsWith('/subscribeSuccess')) {
          assert.equal(res.statusCode, 400);
        } else {
          assert.equal(res.statusCode, 200);
        }
      });
      this.addTest(newTest);
    }
  });
  it('placeholder', () => {
    assert(true);
  });
});
describe(c.blue('[TEST] api management'), () => {
  beforeEach(function getApiRecord(done) {
    db.from('api_keys')
      .where({
        account_id: 1,
      })
      .then((res) => {
        this.previousKey = res[0]?.api_key;
        this.previousCustomer = res[0]?.customer_id;
        this.previousSub = res[0]?.subscription_id;
        this.previousIsCanceled = res[0]?.is_canceled;
        done();
      })
      .catch((err) => done(err));
  });

  it('should get 403 when not logged in.', (done) => {
    supertest(app)
      .get('/keys')
      .then((res) => {
        assert.equal(res.statusCode, 403);
        return done();
      })
      .catch((err) => done(err));
  });

  it('should not get fields for GET', (done) => {
    supertest(app)
      .get('/keys?loggedin=1')
      .then((res) => {
        assert.equal(res.statusCode, 200);
        assert.deepStrictEqual(res.body, {});
        return done();
      })
      .catch((err) => done(err));
  });

  it('should create api key', function testCreatingApiKey(done) {
    this.timeout(5000);
    supertest(app)
      .post('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_visa',
          email: 'test@test.com',
        },
      })
      .then((res) => {
        assert.equal(res.statusCode, 200);

        supertest(app)
          .get('/keys?loggedin=1')
          .end((err, res) => {
            if (err) {
              done(err);
            } else {
              assert.equal(res.statusCode, 200);
              assert.equal(res.body.customer.credit_brand, 'Visa');
              assert.notEqual(res.body.customer.api_key, null);
              assert.equal(Array.isArray(res.body.openInvoices), true);
              assert.equal(Array.isArray(res.body.usage), true);
              redis.sismember(
                'api_keys',
                res.body.customer.api_key,
                (err, resp) => {
                  if (err) {
                    return done(err);
                  }
                  assert.equal(resp, 1);
                  return done();
                },
              );
            }
          });
      })
      .catch((err) => done(err));
  });

  it('post should not change key', function testPostDoesNotChangeKey(done) {
    this.timeout(5000);
    supertest(app)
      .get('/keys?loggedin=1')
      .then((res) => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.customer.credit_brand, 'Visa');

        const previousCredit = res.body.customer.credit_brand;

        supertest(app)
          .post('/keys?loggedin=1')
          .send({
            token: {
              id: 'tok_discover',
              email: 'test@test.com',
            },
          })
          .then((res) => {
            assert.equal(res.statusCode, 200);

            db.from('api_keys')
              .where({
                account_id: 1,
              })
              .then((res2) => {
                if (res2.length === 0) {
                  throw Error('No API record found');
                }
                assert.equal(res2[0].customer_id, this.previousCustomer);
                assert.equal(res2[0].subscription_id, this.previousSub);
                supertest(app)
                  .get('/keys?loggedin=1')
                  .end((err, res) => {
                    if (err) {
                      return done(err);
                    }

                    assert.equal(res.statusCode, 200);
                    assert.equal(
                      res.body.customer.credit_brand,

                      previousCredit,
                    );
                    assert.equal(res.body.customer.api_key, this.previousKey);
                    return done();
                  });
              })
              .catch((err) => done(err));
          })
          .catch((err) => done(err));
      })
      .catch((err) => done(err));
  });

  it('put should update payment but not change customer/sub', function testPutOnlyChangesBilling(done) {
    this.timeout(5000);
    supertest(app)
      .put('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_mastercard',
          email: 'test@test.com',
        },
      })
      .then((res) => {
        assert.equal(res.statusCode, 200);

        supertest(app)
          .get('/keys?loggedin=1')
          .then((res) => {
            assert.equal(res.statusCode, 200);
            assert.equal(res.body.customer.credit_brand, 'MasterCard');
            assert.equal(res.body.customer.api_key, this.previousKey);
            db.from('api_keys')
              .where({
                account_id: 1,
              })
              .then((res2) => {
                if (res2.length === 0) {
                  throw Error('No API record found');
                }
                assert.equal(res2[0].customer_id, this.previousCustomer);
                assert.equal(res2[0].subscription_id, this.previousSub);
                return done();
              })
              .catch((err) => done(err));
          })
          .catch((err) => done(err));
      })
      .catch((err) => done(err));
  });
  it('delete should set is_deleted and remove from redis but not change other db fields', function testDeleteOnlyModifiesKey(done) {
    this.timeout(5000);
    assert.notEqual(this.previousKey, null);
    assert.equal(this.previousIsCanceled, undefined);
    redis.sismember('api_keys', this.previousKey, (err, resp) => {
      if (err) {
        done(err);
      } else {
        assert.equal(resp, 1);
        supertest(app)
          .delete('/keys?loggedin=1')
          .then((res) => {
            assert.equal(res.statusCode, 200);

            db.from('api_keys')
              .where({
                account_id: 1,
              })
              .then((res2) => {
                if (res2.length === 0) {
                  throw Error('No API record found');
                }
                assert.equal(res2[0].api_key, this.previousKey);
                assert.equal(res2[0].customer_id, this.previousCustomer);
                assert.equal(res2[0].subscription_id, this.previousSub);
                assert.equal(res2[0].is_canceled, true);
                redis.sismember('api_keys', this.previousKey, (err, resp) => {
                  if (err) {
                    return done(err);
                  }
                  assert.equal(resp, 0);
                  return done();
                });
              })
              .catch((err) => done(err));
          })
          .catch((err) => done(err));
      }
    });
  });

  it('should get new key with new sub but not change customer', function testGettingNewKey(done) {
    this.timeout(5000);
    supertest(app)
      .post('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_discover',
          email: 'test@test.com',
        },
      })
      .then((res) => {
        assert.equal(res.statusCode, 200);

        db.from('api_keys')
          .where({
            account_id: 1,
            is_canceled: null,
          })
          .then((res2) => {
            if (res2.length === 0) {
              throw Error('No API record found');
            }
            assert.equal(res2[0].customer_id, this.previousCustomer);
            assert.notEqual(res2[0].subscription_id, this.previousSub);
            supertest(app)
              .get('/keys?loggedin=1')
              .end((err, res) => {
                if (err) {
                  return done(err);
                }

                assert.equal(res.statusCode, 200);
                assert.equal(res.body.customer.credit_brand, 'Discover');
                assert.notEqual(res.body.customer.api_key, null);
                assert.notEqual(res.body.customer.api_key, this.previousKey);
                return done();
              });
          })
          .catch((err) => done(err));
      })
      .catch((err) => done(err));
  });
  it('should fail to create key if open invoice', function openInvoice(done) {
    this.timeout(5000);
    // delete the key first
    supertest(app)
      .delete('/keys?loggedin=1')
      .then(async (res) => {
        assert.equal(res.statusCode, 200);
        //@ts-ignore
        const stripe = stripeLib(STRIPE_SECRET);

        await stripe.invoiceItems.create({
          customer: this.previousCustomer,
          price: 'price_1Lm1siCHN72mG1oKkk3Jh1JT', // test $123 one time
        });

        const invoice = await stripe.invoices.create({
          customer: this.previousCustomer,
        });

        await stripe.invoices.finalizeInvoice(invoice.id);

        supertest(app)
          .post('/keys?loggedin=1')
          .send({
            token: {
              id: 'tok_discover',
              email: 'test@test.com',
            },
          })
          .then((res) => {
            assert.equal(res.statusCode, 402);
            assert.equal(res.body.error, 'Open invoice');

            supertest(app)
              .get('/keys?loggedin=1')
              .end((err, res) => {
                if (err) {
                  return done(err);
                }

                assert.equal(res.statusCode, 200);
                assert.equal(res.body.customer, null);
                assert.equal(res.body.openInvoices[0].id, invoice.id);
                assert.equal(res.body.openInvoices[0].amountDue, 12300);
                db.from('api_keys')
                  .where({
                    account_id: 1,
                    is_canceled: null,
                  })
                  .then((res) => {
                    assert.equal(res.length, 0);
                    return done();
                  });
              });
          });
      })
      .catch((err) => done(err));
  });
});
describe(c.blue('[TEST] api limits'), () => {
  before(async () => {
    config.ENABLE_API_LIMIT = '1';
    config.API_FREE_LIMIT = 10;
    await redis
      .multi()
      .del('user_usage_count')
      .del('usage_count')
      .sadd('api_keys', 'KEY')
      .exec();
  });

  it('should be able to make API calls without key with whitelisted routes unaffected. One call should fail as rate limit is hit. Last ones should succeed as they are whitelisted', async function testNoApiLimit() {
    this.timeout(25000);
    await testWhiteListedRoutes('');
    await testRateCheckedRoute();
    const res = await supertest(app).get('/api/matches/1781962623');
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, 'monthly api limit exceeded');
    await testWhiteListedRoutes('');
  });

  it('should be able to make more than 10 calls when using API KEY', async function testAPIKeyLimitsAndCounting() {
    this.timeout(25000);
    for (let i = 0; i < 25; i++) {
      let regular = await supertest(app).get(
        '/api/matches/1781962623?api_key=KEY',
      );
      assert.equal(regular.statusCode, 200);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    // Try whitelisted routes. Should not increment usage.
    await testWhiteListedRoutes('?api_key=KEY');
    // Try a 429. Should not increment usage.
    const tooMany = await supertest(app).get('/gen429');
    assert.equal(tooMany.statusCode, 429);
    // Try a 500. Should not increment usage.
    const err = await supertest(app).get('/gen500');
    assert.equal(err.statusCode, 500);

    const res = await redis.hgetall('usage_count');
    assert.ok(res);
    const keys = Object.keys(res);
    assert.equal(keys.length, 1);
    assert.equal(Number(res[keys[0]]), 25);
  });

  after(() => {
    config.ENABLE_API_LIMIT = '';
    config.API_FREE_LIMIT = 50000;
  });
});

async function testWhiteListedRoutes(key: string) {
  const routes = [
    `/api${key}`, // Docs
    `/api/metadata${key}`, // Login status
    `/keys${key}`, // API Key management
  ];
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const res = await supertest(app).get(route);
    assert.notEqual(res.statusCode, 429);
  }
}

async function testRateCheckedRoute() {
  for (let i = 0; i < 10; i++) {
    const res = await supertest(app).get('/api/matches/1781962623');
    assert.equal(res.statusCode, 200);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function initElasticsearch() {
  console.log('Create Elasticsearch Mapping');
  const mapping = JSON.parse(
    readFileSync('./elasticsearch/index.json', { encoding: 'utf-8' }),
  );
  const exists = await es.indices.exists({
    index: 'dota-test', // Check if index already exists, in which case, delete it
  });
  if (exists.body) {
    await es.indices.delete({
      index: 'dota-test',
    });
  }
  await es.indices.create({
    index: 'dota-test',
  });
  await es.indices.close({
    index: 'dota-test',
  });
  await es.indices.putSettings({
    index: 'dota-test',
    body: mapping.settings,
  });
  await es.indices.putMapping({
    index: 'dota-test',
    type: 'player',
    body: mapping.mappings.player,
  });
  await es.indices.open({
    index: 'dota-test',
  });
}

async function initRedis() {
  console.log('wiping redis');
  await redis.flushdb();
}

async function initPostgres() {
  const pool = new Pool({
    connectionString: initPostgresHost,
  });
  const client = await pool.connect();
  console.log('drop postgres test database');
  await client.query('DROP DATABASE IF EXISTS yasp_test');
  console.log('create postgres test database');
  await client.query('CREATE DATABASE yasp_test');
  const pool2 = new Pool({
    connectionString: POSTGRES_URL,
  });
  const client2 = await pool2.connect();
  console.log('create postgres test tables');
  const query = readFileSync('./sql/create_tables.sql', 'utf8');
  await client2.query(query);
  // ready to create client
  console.log('insert postgres test data');
  // populate the DB with this leagueid so we insert a pro match
  await db.raw(
    "INSERT INTO leagues(leagueid, tier) VALUES(5399, 'professional')",
  );
}

async function initCassandra() {
  const init = new Client({
    contactPoints: [initCassandraHost],
    localDataCenter: 'datacenter1',
  });
  console.log('drop cassandra test keyspace');
  await init.execute('DROP KEYSPACE IF EXISTS yasp_test');
  console.log('create cassandra test keyspace');
  await init.execute(
    "CREATE KEYSPACE yasp_test WITH REPLICATION = { 'class': 'NetworkTopologyStrategy', 'datacenter1': 1 };",
  );
  console.log('create cassandra tables');
  const tables = readFileSync('./sql/create_tables.cql', 'utf8')
    .split(';')
    .filter((cql) => cql.length > 1);
  for (let i = 0; i < tables.length; i++) {
    const cql = tables[i];
    await init.execute('USE yasp_test');
    await init.execute(cql);
  }
}

async function initScylla() {
  const init = new Client({
    contactPoints: [initScyllaHost],
    localDataCenter: 'datacenter1',
  });
  console.log(initScyllaHost);
  console.log('drop scylla test keyspace');
  await init.execute('DROP KEYSPACE IF EXISTS yasp_test');
  console.log('create scylla test keyspace');
  await init.execute(
    "CREATE KEYSPACE yasp_test WITH REPLICATION = { 'class': 'NetworkTopologyStrategy', 'datacenter1': 1 };",
  );
  console.log('create scylla tables');
  const tables = readFileSync('./sql/create_tables.cql', 'utf8')
    .split(';')
    .filter((cql) => cql.length > 1);
  for (let i = 0; i < tables.length; i++) {
    const cql = tables[i];
    await init.execute('USE yasp_test');
    await init.execute(cql);
  }
}

async function startServices() {
  console.log('starting services');
  app = (await import('../svc/web.ts' + '')).default as unknown as Express;
  await import('../svc/parser.ts' + '');
  await import('../svc/mmr.ts' + '');
}

async function loadMatches() {
  console.log('loading matches');
  const arr = [detailsApi.result, detailsApiPro.result, detailsApiPro.result];
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    await insertMatch(m, {
      type: 'api',
      origin: 'scanner',
      skipParse: true,
    });
  }
}

async function loadPlayers() {
  console.log('loading players');
  await Promise.all(
    summariesApi.response.players.map((p) => upsertPlayer(db, p, true)),
  );
}

/*
describe(c.blue('[TEST] generateMatchups'), () => {
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
    const funcs = [
      async function zeroVzero() {
        const res = await supertest(app).get('/api/matchups').expect(200);
        assert.equal(res.body.t0, 1);
        assert.equal(res.body.t1, 0);
      },
      async function oneVzeroRight() {
        const res = await supertest(app).get('/api/matchups?t1=1').expect(200);
        assert.equal(res.body.t0, 1);
        assert.equal(res.body.t1, 0);
      },
      async function oneVzero() {
        const res = await supertest(app).get('/api/matchups?t0=1').expect(200);
        assert.equal(res.body.t0, 0);
        assert.equal(res.body.t1, 1);
      },
      async function oneVzero2() {
        const res = await supertest(app).get('/api/matchups?t0=6').expect(200);
        assert.equal(res.body.t0, 0);
        assert.equal(res.body.t1, 1);
      },
      async function oneVzero3() {
        const res = await supertest(app).get('/api/matchups?t0=46').expect(200);
        assert.equal(res.body.t0, 1);
        assert.equal(res.body.t1, 0);
      },
      async function oneVone() {
        const res = await supertest(app).get('/api/matchups?t0=1&t1=46').expect(200);
        assert.equal(res.body.t0, 0);
        assert.equal(res.body.t1, 1);
      },
      async function oneVoneInvert() {
        const res = await supertest(app).get('/api/matchups?t0=46&t1=1').expect(200);
        assert.equal(res.body.t0, 1);
        assert.equal(res.body.t1, 0);
      },
    ];
    done();
  });
});
*/
