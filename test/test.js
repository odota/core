/* global before describe it beforeEach after */
/**
 * Main test script to run tests
 * */
process.env.NODE_ENV = 'test';
const async = require('async');
const nock = require('nock');
const assert = require('assert');
const supertest = require('supertest');
const stripeLib = require('stripe');
const pg = require('pg');
const fs = require('fs');
const cassandraDriver = require('cassandra-driver');
const swaggerParser = require('@apidevtools/swagger-parser');
const config = require('../config');
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
let redis;
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
  this.timeout(60000);
  async.series(
    [
      (cb) => initPostgres(cb),
      (cb) => initCassandra(cb),
      (cb) => initElasticsearch(cb),
      (cb) => initRedis(cb),
      (cb) => startServices(cb),
      (cb) => queriesAndMatches(cb),
      (cb) => loadMatches(cb),
      (cb) => loadPlayers(cb),
    ],
    done
  );
});
describe('swagger schema', async function testSwaggerSchema() {
  this.timeout(2000);
  const spec = (await import('../routes/spec.mjs')).default;
  it('should be valid', (cb) => {
    const validOpts = {
      validate: {
        schema: true,
        spec: true,
      },
    };
    // We stringify and imediately parse the object in order to remove the route() and func() properties, which arent a part of the OpenAPI spec
    swaggerParser.validate(
      JSON.parse(JSON.stringify(spec)),
      validOpts,
      (err) => {
        if (!err) {
          assert(!err);
        } else {
          assert.fail(err.message);
        }
        cb();
      }
    );
  });
});
describe('replay parse', function () {
  this.timeout(120000);
  const tests = {
    '1781962623_1.dem': detailsApi.result,
  };
  const key = '1781962623_1.dem';
  it(`should parse replay ${key}`, async () => {
    const matchData = tests[key];
    nock(`http://${config.RETRIEVER_HOST}`)
      .get('/')
      .query(true)
      .reply(200, {
        match: {
          match_id: matchData.match_id,
          cluster: matchData.cluster,
          replay_salt: 1,
          series_id: 0,
          series_type: 0,
          players: [],
        },
      });
    console.log('inserting match and requesting parse');
    try {
      const job = await queries.insertMatchPromise(matchData, {
        cassandra,
        type: 'api',
        forceParse: true,
        attempts: 1,
      });
      assert(job);
    } catch (e) {
      console.log(e);
      throw e;
    }
    console.log('waiting for insert settle');
    await new Promise((resolve) => setTimeout(resolve, 20000));
    console.log('checking parsed match');
    // ensure parse data got inserted
    const match = await buildMatch(tests[key].match_id);
    // console.log(match.players[0]);
    assert(match.players);
    assert(match.players[0]);
    assert(match.players[0].killed.npc_dota_creep_badguys_melee === 46);
    assert(match.players[0].lh_t && match.players[0].lh_t.length > 0);
    assert(match.teamfights && match.teamfights.length > 0);
    assert(match.draft_timings);
    assert(match.radiant_gold_adv && match.radiant_gold_adv.length > 0);
  });
});
describe('teamRanking', () => {
  it('should have team rankings', (cb) => {
    db.select(['team_id', 'rating', 'wins', 'losses'])
      .from('team_rating')
      .asCallback((err, rows) => {
        // We inserted the pro match twice so expect to update the ratings twice
        const loser = rows.find((row) => row.team_id === 4251435);
        const winner = rows.find((row) => row.team_id === 1375614);
        console.log(loser.rating, winner.rating);
        assert(loser.losses === 2);
        assert(winner.wins === 2);
        assert(loser.rating < winner.rating);
        return cb(err);
      });
  });
});
// TODO also test on unparsed match to catch exceptions caused by code expecting parsed data
describe('api', () => {
  it('should get API spec', function testAPISpec(cb) {
    this.timeout(5000);
    supertest(app)
      .get('/api')
      .end((err, res) => {
        if (err) {
          return cb(err);
        }
        const spec = res.body;
        return async.eachSeries(
          Object.keys(spec.paths),
          (path, cb) => {
            const replacedPath = path
              .replace(/{match_id}/, 1781962623)
              .replace(/{account_id}/, 120269134)
              .replace(/{team_id}/, 15)
              .replace(/{hero_id}/, 1)
              .replace(/{league_id}/, 1)
              .replace(/{field}/, 'kills')
              .replace(/{resource}/, 'heroes');
            async.eachSeries(
              Object.keys(spec.paths[path]),
              (verb, cb) => {
                if (
                  path.indexOf('/explorer') === 0 ||
                  path.indexOf('/request') === 0
                ) {
                  return cb(err);
                }
                return supertest(app)
                  [verb](`/api${replacedPath}?q=testsearch`)
                  .end((err, res) => {
                    if (err || res.statusCode !== 200) {
                      console.error(verb, replacedPath, res.body);
                    }
                    if (replacedPath.startsWith('/admin')) {
                      assert.equal(res.statusCode, 403);
                    } else if (replacedPath.startsWith('/subscribeSuccess')) {
                      assert.equal(res.statusCode, 400);
                    } else {
                      assert.equal(res.statusCode, 200);
                    }
                    return cb(err);
                  });
              },
              cb
            );
          },
          cb
        );
      });
  });
});
describe('api management', () => {
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
                }
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

                      previousCredit
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
                if (res.length === 0) {
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
        const stripe = stripeLib(config.STRIPE_SECRET);

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
describe('api limits', () => {
  before((done) => {
    config.ENABLE_API_LIMIT = true;
    config.API_FREE_LIMIT = 10;
    redis
      .multi()
      .del('user_usage_count')
      .del('usage_count')
      .sadd('api_keys', 'KEY')
      .exec((err) => {
        if (err) {
          return done(err);
        }

        return done();
      });
  });

  function testWhiteListedRoutes(done, key) {
    async.eachSeries(
      [
        `/api${key}`, // Docs
        `/api/metadata${key}`, // Login status
        `/keys${key}`, // API Key management
      ],

      (i, cb) => {
        supertest(app)
          .get(i)

          .end((err, res) => {
            if (err) {
              return cb(err);
            }

            assert.notEqual(res.statusCode, 429);
            return cb();
          });
      },
      done
    );
  }

  function testRateCheckedRoute(done) {
    async.timesSeries(
      10,
      (i, cb) => {
        setTimeout(() => {
          supertest(app)
            .get('/api/matches/1781962623')
            .end((err, res) => {
              if (err) {
                return cb(err);
              }

              assert.equal(res.statusCode, 200);
              return cb();
            });
        }, i * 300);
      },

      done
    );
  }

  it('should be able to make API calls without key with whitelisted routes unaffected. One call should fail as rate limit is hit. Last ones should succeed as they are whitelisted', function testNoApiLimit(done) {
    this.timeout(25000);
    testWhiteListedRoutes((err) => {
      if (err) {
        done(err);
      } else {
        testRateCheckedRoute((err) => {
          if (err) {
            done(err);
          } else {
            supertest(app)
              .get('/api/matches/1781962623')
              .end((err, res) => {
                if (err) {
                  done(err);
                }
                assert.equal(res.statusCode, 429);
                assert.equal(res.body.error, 'monthly api limit exceeded');

                testWhiteListedRoutes(done, '');
              });
          }
        });
      }
    }, '');
  });

  it('should be able to make more than 10 calls when using API KEY', function testAPIKeyLimitsAndCounting(done) {
    this.timeout(25000);
    async.timesSeries(
      25,
      (i, cb) => {
        supertest(app)
          .get('/api/matches/1781962623?api_key=KEY')
          .end((err, res) => {
            if (err) {
              return cb(err);
            }

            assert.equal(res.statusCode, 200);
            return cb();
          });
      },
      () => {
        // Try whitelisted routes. Should not increment usage.
        testWhiteListedRoutes((err) => {
          if (err) {
            done(err);
          } else {
            // Try a 429. Should not increment usage.
            supertest(app)
              .get('/gen429')
              .end((err, res) => {
                if (err) {
                  done(err);
                }
                assert.equal(res.statusCode, 429);

                // Try a 500. Should not increment usage.
                supertest(app)
                  .get('/gen500')
                  .end((err, res) => {
                    if (err) {
                      done(err);
                    }
                    assert.equal(res.statusCode, 500);
                    redis.hgetall('usage_count', (err, res) => {
                      if (err) {
                        done(err);
                      } else {
                        const keys = Object.keys(res);
                        assert.equal(keys.length, 1);
                        assert.equal(Number(res[keys[0]]), 25);
                        done();
                      }
                    });
                  });
              });
          }
        }, '?api_key=KEY');
      }
    );
  });

  after(() => {
    config.ENABLE_API_LIMIT = false;
    config.API_FREE_LIMIT = 50000;
  });
});

async function initElasticsearch(cb) {
  console.log('Create Elasticsearch Mapping');
  const mapping = JSON.parse(fs.readFileSync('./elasticsearch/index.json'));
  const { es } = await import('../store/elasticsearch.mjs');
  async.series(
    [
      (cb) => {
        es.indices.exists(
          {
            index: 'dota-test', // Check if index already exists, in which case, delete it
          },
          (err, exists) => {
            if (err) {
              console.warn(err);
              cb();
            } else if (exists.body) {
              es.indices.delete(
                {
                  index: 'dota-test',
                },
                (err) => {
                  if (err) {
                    console.warn(err);
                  }
                  cb();
                }
              );
            } else {
              cb();
            }
          }
        );
      },
      (cb) => {
        es.indices.create(
          {
            index: 'dota-test',
          },
          cb
        );
      },
      (cb) => {
        es.indices.close(
          {
            index: 'dota-test',
          },
          cb
        );
      },
      (cb) => {
        es.indices.putSettings(
          {
            index: 'dota-test',
            body: mapping.settings,
          },
          cb
        );
      },
      (cb) => {
        es.indices.putMapping(
          {
            index: 'dota-test',
            type: 'player',
            body: mapping.mappings.player,
          },
          cb
        );
      },
      (cb) => {
        es.indices.open(
          {
            index: 'dota-test',
          },
          cb
        );
      },
    ],
    cb
  );
}

async function initRedis(cb) {
  redis = (await import('../store/redis.mjs')).default;
  console.log('wiping redis');
  redis.flushdb((err, success) => {
    console.log(err, success);
    cb(err);
  });
}

async function initPostgres(cb) {
  const pool = new pg.Pool({
    connectionString: initPostgresHost,
  });
  pool.connect((err, client) => {
    if (err) {
      return cb(err);
    }
    return async.series(
      [
        function drop(cb) {
          console.log('drop postgres test database');
          client.query('DROP DATABASE IF EXISTS yasp_test', cb);
        },
        function create(cb) {
          console.log('create postgres test database');
          client.query('CREATE DATABASE yasp_test', cb);
        },
        function tables(cb) {
          const pool2 = new pg.Pool({
            connectionString: config.POSTGRES_URL,
          });
          pool2.connect((err, client2) => {
            if (err) {
              return cb(err);
            }
            console.log('create postgres test tables');
            const query = fs.readFileSync('./sql/create_tables.sql', 'utf8');
            return client2.query(query, cb);
          });
        },
        (cb) => setupPostgresClient(cb),
      ],
      cb
    );
  });
}

async function initCassandra(cb) {
  const client = new cassandraDriver.Client({
    contactPoints: [initCassandraHost],
    localDataCenter: 'datacenter1',
  });
  async.series(
    [
      function drop(cb) {
        console.log('drop cassandra test keyspace');
        client.execute('DROP KEYSPACE IF EXISTS yasp_test', cb);
      },
      function create(cb) {
        console.log('create cassandra test keyspace');
        client.execute(
          "CREATE KEYSPACE yasp_test WITH REPLICATION = { 'class': 'NetworkTopologyStrategy', 'datacenter1': 1 };",
          cb
        );
      },
      (cb) => setupCassandraClient(cb),
      function tables(cb) {
        console.log('create cassandra test tables');
        async.eachSeries(
          fs
            .readFileSync('./sql/create_tables.cql', 'utf8')
            .split(';')
            .filter((cql) => cql.length > 1),
          (cql, cb) => {
            cassandra.execute(cql, cb);
          },
          cb
        );
      },
    ],
    cb
  );
}

async function startServices(cb) {
  console.log('starting services');
  try {
    app = (await import('../svc/web.mjs')).default;
    await import('../svc/parser.mjs');
  } catch (e) {
    console.log(e);
    cb(e);
  }
  cb();
}

async function loadMatches(cb) {
  console.log('loading matches');
  const arr = [detailsApi.result, detailsApiPro.result, detailsApiPro.result];
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    await queries.insertMatchPromise(m, {
      type: 'api',
      origin: 'scanner',
      skipParse: true,
    });
  }
  cb();
}

async function loadPlayers(cb) {
  console.log('loading players');
  await Promise.all(
    summariesApi.response.players.map((p) =>
      queries.insertPlayerPromise(db, p, true)
    )
  );
  cb();
}

async function setupPostgresClient(cb) {
  db = (await import('../store/db.mjs')).default;
  console.log('insert postgres test data');
  // populate the DB with this leagueid so we insert a pro match
  db.raw(
    "INSERT INTO leagues(leagueid, tier) VALUES(5399, 'professional')"
  ).asCallback(cb);
}

async function setupCassandraClient(cb) {
  cassandra = (await import('../store/cassandra.mjs')).default;
  cb();
}

async function queriesAndMatches(cb) {
  queries = (await import('../store/queries.mjs')).default;
  buildMatch = (await import('../store/buildMatch.mjs')).default;
  cb();
}
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
