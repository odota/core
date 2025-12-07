import type { Express } from 'express';
import assert from 'node:assert';
import supertest from 'supertest';
import stripe from '../svc/store/stripe.ts';
import redis from '../svc/store/redis.ts';
import summariesApi from '../json/summaries_api.json' with { type: 'json' };
import historyApi from '../json/history_api.json' with { type: 'json' };
import retrieverPlayer from '../json/retriever_player.json' with { type: 'json' };
import detailsApiPro from '../json/details_api_pro.json' with { type: 'json' };
import retrieverMatch from '../json/retriever_match.json' with { type: 'json' };
import detailsApi from '../json/details_api.json' with { type: 'json' };
import { Client as DBClient } from 'pg';
import { readFileSync } from 'node:fs';
import { Client } from 'cassandra-driver';
import nock from 'nock';
import swaggerParser from '@apidevtools/swagger-parser';
import config from '../config.ts';
import spec from '../svc/api/spec.ts';
import { getPlayerMatches } from '../svc/util/buildPlayer.ts';
import { insertMatch } from '../svc/util/insert.ts';
import { buildMatch } from '../svc/util/buildMatch.ts';
import db, { upsertPlayer } from '../svc/store/db.ts';
import cassandra from '../svc/store/cassandra.ts';
import c from 'ansi-colors';
import { suite, test, before, beforeEach, after } from 'node:test';
import { S3Client } from '@bradenmacdonald/s3-lite-client';
import { averageMedal } from '../svc/util/utility.ts';

const { RETRIEVER_HOST, POSTGRES_URL, CASSANDRA_URL } = config;
const initPostgresHost = POSTGRES_URL.replace('/yasp_test', '/postgres');
const initCassandraHost = new URL(CASSANDRA_URL).host;
const testKey = '56bc4c35-586c-4f58-a55b-7a5247613872';
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
  .reply(200, historyApi);

nock(`http://${RETRIEVER_HOST}`)
  .get(/\/profile\/.*/)
  // fake mmr response up to 14 times for 7 non-anonymous players in test match inserted twice
  // add 1 more for refresh request
  // add 3 more for discovered players
  .times(18)
  .query(true)
  .reply(200, retrieverPlayer)
  // fake error to test handling
  .get('/match/1781962623')
  .query(true)
  .reply(500, {})
  // fake GC match details
  .get('/match/1781962623')
  .query(true)
  // We faked the replay salt to 1 to match the testfile name
  .reply(200, retrieverMatch);
// NOTE: If updating to nock 14+ it will also capture requests made to Stripe API which we need to either bypass or mock

await initPostgres();
await initRedis();
await initCassandra();
await initMinio();
await loadMatches();
await loadPlayers();
await startServices();
// Wait one second to give mmr time to update
await new Promise((resolve) => setTimeout(resolve, 1000));

async function initRedis() {
  console.log('wiping redis');
  await redis.flushdb();
}

async function initPostgres() {
  const client = new DBClient({
    connectionString: initPostgresHost,
  });
  client.connect();
  console.log('drop postgres test database');
  await client.query('DROP DATABASE IF EXISTS yasp_test');
  console.log('create postgres test database');
  await client.query('CREATE DATABASE yasp_test');
  const client2 = new DBClient({
    connectionString: POSTGRES_URL,
  });
  client2.connect();
  console.log('create postgres test tables');
  const query = readFileSync('./sql/create_tables.sql', 'utf8');
  await client2.query(query);
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
  for (let cql of tables) {
    await init.execute('USE yasp_test');
    await init.execute(cql);
  }
}

async function initMinio() {
  const client = new S3Client({
    endPoint: config.ARCHIVE_S3_ENDPOINT,
    region: 'local',
    accessKey: config.ARCHIVE_S3_KEY_ID,
    secretKey: config.ARCHIVE_S3_KEY_SECRET,
    bucket: config.BLOB_ARCHIVE_S3_BUCKET,
  });
  // Make a new test bucket with a new name
  // There's no good way to delete the test bucket automatically since we can't delete nonempty buckets
  console.log('create minio test bucket');
  await client.makeBucket(config.BLOB_ARCHIVE_S3_BUCKET);
  // Put a test blob
  await client.putObject('test', 'test');
  // Assert we can read without exception
  const result = await client.getObject('test');
  assert.equal(await result.text(), 'test');
  // Assert it rejects when reading invalid key
  assert.rejects(async () => {
    await client.getObject('invalid');
  });
}

async function startServices() {
  console.log('starting services');
  await import('../svc/parser.ts');
  await import('../svc/mmr.ts');
  const web = await import('../svc/web.ts');
  app = web.app;
}

async function loadMatches() {
  console.log('loading matches');
  const arr = [detailsApi.result, detailsApiPro.result, detailsApiPro.result];
  for (let m of arr) {
    await insertMatch(m, {
      type: 'api',
      // Pretend to be scanner insert so we queue mmr/counts update etc.
      origin: 'scanner',
      skipParse: true,
    });
  }
}

async function loadPlayers() {
  console.log('loading players');
  await Promise.all(
    summariesApi.response.players.map((p) => upsertPlayer(db, p)),
  );
}

suite(c.blue('AVERAGE MEDAL'), async () => {
  test('should calculate average medal correctly', () => {
    const test1 = [14, 15, 21];
    assert.equal(averageMedal(test1), 15);
    const test2 = [80, 80, 80];
    assert.equal(averageMedal(test2), 75);
  });
});

suite(c.blue('API MANAGEMENT'), async () => {
  let previousKey: string;
  let previousCustomer: string;
  let previousSub: string;
  let previousIsCanceled: boolean;
  beforeEach(async () => {
    const res = await db.from('api_keys').where({
      account_id: 1,
    });
    previousKey = res[0]?.api_key;
    previousCustomer = res[0]?.customer_id;
    previousSub = res[0]?.subscription_id;
    previousIsCanceled = res[0]?.is_canceled;
  });

  test('should get 403 when not logged in.', async () => {
    const res = await supertest(app).get('/keys');
    assert.equal(res.statusCode, 403);
  });

  test('should not get fields for GET', async () => {
    const res = await supertest(app).get('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    assert.deepStrictEqual(res.text, '{}');
  });

  test('should create api key', async () => {
    let res = await supertest(app)
      .post('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_visa',
          email: 'test@test.com',
        },
      });
    assert.equal(res.statusCode, 200);

    res = await supertest(app).get('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.customer.credit_brand, 'Visa');
    assert.notEqual(res.body.customer.api_key, null);
    assert.equal(Array.isArray(res.body.openInvoices), true);
    assert.equal(Array.isArray(res.body.usage), true);
    const { rows } = await db.raw(
      'select api_key from api_keys where api_key = ? AND is_canceled IS NOT TRUE',
      [res.body.customer.api_key],
    );
    assert.equal(rows.length, 1);
  });

  test('post should not change key', async () => {
    let res = await supertest(app).get('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.customer.credit_brand, 'Visa');

    const previousCredit = res.body.customer.credit_brand;

    res = await supertest(app)
      .post('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_discover',
          email: 'test@test.com',
        },
      });
    assert.equal(res.statusCode, 200);

    const res2 = await db.from('api_keys').where({
      account_id: 1,
    });
    if (res2.length === 0) {
      throw Error('No API record found');
    }
    assert.equal(res2[0].customer_id, previousCustomer);
    assert.equal(res2[0].subscription_id, previousSub);

    res = await supertest(app).get('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.customer.credit_brand, previousCredit);
    assert.equal(res.body.customer.api_key, previousKey);
  });

  test('put should update payment but not change customer/sub', async () => {
    let res = await supertest(app)
      .put('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_mastercard',
          email: 'test@test.com',
        },
      });
    assert.equal(res.statusCode, 200);

    res = await supertest(app).get('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.customer.credit_brand, 'MasterCard');
    assert.equal(res.body.customer.api_key, previousKey);

    const res2 = await db.from('api_keys').where({
      account_id: 1,
    });
    if (res2.length === 0) {
      throw Error('No API record found');
    }
    assert.equal(res2[0].customer_id, previousCustomer);
    assert.equal(res2[0].subscription_id, previousSub);
  });
  test('delete should set is_deleted and remove from redis but not change other db fields', async () => {
    assert.notEqual(previousKey, null);
    assert.equal(previousIsCanceled, undefined);
    const res = await supertest(app).delete('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    const res2 = await db.from('api_keys').where({
      account_id: 1,
    });
    if (res2.length === 0) {
      throw Error('No API record found');
    }
    assert.equal(res2[0].api_key, previousKey);
    assert.equal(res2[0].customer_id, previousCustomer);
    assert.equal(res2[0].subscription_id, previousSub);
    assert.equal(res2[0].is_canceled, true);
  });

  test('should get new key with new sub but not change customer', async () => {
    let res = await supertest(app)
      .post('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_discover',
          email: 'test@test.com',
        },
      });
    assert.equal(res.statusCode, 200);

    const res2 = await db.from('api_keys').where({
      account_id: 1,
      is_canceled: null,
    });
    if (res2.length === 0) {
      throw Error('No API record found');
    }
    assert.equal(res2[0].customer_id, previousCustomer);
    assert.notEqual(res2[0].subscription_id, previousSub);

    res = await supertest(app).get('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.customer.credit_brand, 'Discover');
    assert.notEqual(res.body.customer.api_key, null);
    assert.notEqual(res.body.customer.api_key, previousKey);
  });
  test('should fail to create key if open invoice', async () => {
    // delete the key first
    let res = await supertest(app).delete('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);

    await stripe.invoiceItems.create({
      customer: previousCustomer,
      price: 'price_1Lm1siCHN72mG1oKkk3Jh1JT', // test $123 one time
    });

    const invoice = await stripe.invoices.create({
      customer: previousCustomer,
    });

    await stripe.invoices.finalizeInvoice(invoice.id);

    res = await supertest(app)
      .post('/keys?loggedin=1')
      .send({
        token: {
          id: 'tok_discover',
          email: 'test@test.com',
        },
      });
    assert.equal(res.statusCode, 402);
    assert.equal(res.body.error, 'Open invoice');

    res = await supertest(app).get('/keys?loggedin=1');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.customer, null);
    assert.equal(res.body.openInvoices[0].id, invoice.id);
    assert.equal(res.body.openInvoices[0].amountDue, 12300);

    const res2 = await db.from('api_keys').where({
      account_id: 1,
      is_canceled: null,
    });
    assert.equal(res2.length, 0);
  });
});

suite('TESTS', async () => {
  test('swagger schema should be valid', async () => {
    const validOpts = {
      validate: {
        schema: true,
        spec: true,
      },
    };
    // We stringify and imediately parse the object in order to remove the route() and func() properties, which arent a part of the OpenAPI spec
    await swaggerParser.validate(JSON.parse(JSON.stringify(spec)), validOpts);
  });
  // Test fetching matches for first player
  test('player_caches should have one row in player_caches', async () => {
    let data = await getPlayerMatches(120269134, {
      project: ['match_id'],
    });
    assert.equal(data.length, 1);
  });
  test('teamRanking should have team rankings', async () => {
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

suite(c.blue('PLAYERS'), async () => {
  let playerData: any = null;
  before(async () => {
    const res = await supertest(app).get('/api/players/120269134');
    playerData = res.body;
  });
  test('players should have profile data', async () => {
    assert.equal(playerData.profile.account_id, 120269134);
    assert.ok(playerData.profile.personaname);
  });
  test('players should have Dota Plus data', async () => {
    assert.equal(playerData.profile.plus, true);
  });
  test('players should have rank_tier data', async () => {
    assert.equal(playerData.rank_tier, 80);
  });
  test('players should return 404 for nonexistent player', async () => {
    const res = await supertest(app).get('/api/players/666');
    assert.equal(res.statusCode, 404);
  });
});

suite(c.blue('PRIVACY'), async () => {
  test('privacy setting should return one row due to default privacy setting', async () => {
    await db.raw(
      'UPDATE players SET fh_unavailable = NULL WHERE account_id = ?',
      ['120269134'],
    );
    const res = await supertest(app).get('/api/players/120269134/matches');
    assert.equal(res.body.length, 1);
  });
  test('privacy setting should return one row due to visible match data', async () => {
    await db.raw(
      'UPDATE players SET fh_unavailable = FALSE WHERE account_id = ?',
      ['120269134'],
    );
    const res = await supertest(app).get('/api/players/120269134/matches');
    assert.equal(res.body.length, 1);
  });
  test('privacy setting should return no rows due to hidden match data', async () => {
    await db.raw(
      'UPDATE players SET fh_unavailable = TRUE WHERE account_id = ?',
      ['120269134'],
    );
    const res = await supertest(app).get('/api/players/120269134/matches');
    assert.equal(res.body.length, 0);
  });
  test('privacy setting should return no rows in recentMatches due to hidden match data', async () => {
    await db.raw(
      'UPDATE players SET fh_unavailable = TRUE WHERE account_id = ?',
      ['120269134'],
    );
    const res = await supertest(app).get(
      '/api/players/120269134/recentMatches',
    );
    assert.equal(res.body.length, 0);
  });
});

suite(c.blue('API ROUTES'), async () => {
  test('api routes visit all routes in spec', async () => {
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
    for (let t of tests) {
      const [path, verb, replacedPath] = t;
      if (path.indexOf('/explorer') === 0 || path.indexOf('/request') === 0) {
        continue;
      }
      await test(
        `should visit ${replacedPath}`,
        { timeout: 2000 },
        async () => {
          const res = await supertest(app)[verb as HttpVerb](
            // Add query parameters to test search, rankings, benchmarks
            `/api${replacedPath}?q=testsearch&hero_id=1`,
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
        },
      );
    }
  });
  test('search for steamid32', async () => {
    const res = await supertest(app).get(
      `/api/search?q=120269134`,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].account_id, 120269134);
  });
  test('search for steamid64', async () => {
    const res = await supertest(app).get(
      `/api/search?q=76561198080534862`,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].account_id, 120269134);
  });
});

suite(c.blue('RATE LIMITING'), async () => {
  before(async () => {
    config.ENABLE_API_LIMIT = '1';
    config.API_FREE_LIMIT = '5';
    await db.raw(
      'insert into api_keys(account_id, subscription_id, customer_id, api_key) VALUES (?, ?, ?, ?)',
      [2, '1', '1', testKey],
    );
  });

  test('should be able to make API calls without key with whitelisted routes unaffected. One call should fail as rate limit is hit. Last ones should succeed as they are whitelisted', async () => {
    await makeWhitelistedRequests('');
    await makeRateCheckedRequests('', 5);
    const res = await supertest(app).get('/api/matches/1781962623');
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, 'daily api limit exceeded');
    await makeWhitelistedRequests('');
  });

  test('should return user error when using invalid key', async () => {
    const invalidKey = 'not_a_key';
    const invResp = await supertest(app).get(
      '/api/matches/1781962623?api_key=' + invalidKey,
    );
    assert.equal(invResp.statusCode, 400);
  });

  test('should be able to make more than 5 calls when using API key', async () => {
    // Try whitelisted routes. Should not increment usage.
    await makeWhitelistedRequests('?api_key=' + testKey);

    // Make calls that count toward limit
    await makeRateCheckedRequests('?api_key=' + testKey, 10);

    // Try a 429. Should not increment usage.
    const tooMany = await supertest(app).get('/gen429?api_key=' + testKey);
    assert.equal(tooMany.statusCode, 429);
    // Try a 500. Should not increment usage.
    const err = await supertest(app).get('/gen500?api_key=' + testKey);
    assert.equal(err.statusCode, 500);

    const { rows } = await db.raw('SELECT * from api_key_usage');
    assert.ok(rows);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].usage_count), 10);
  });

  async function makeWhitelistedRequests(key: string) {
    const routes = [
      `/api${key}`, // Docs
      `/api/metadata${key}`, // Login status
    ];
    for (let route of routes) {
      const res = await supertest(app).get(route);
      assert.notEqual(res.statusCode, 429);
    }
  }

  async function makeRateCheckedRequests(key: string, num: number) {
    for (let i = 0; i < num; i++) {
      const res = await supertest(app).get(`/api/matches/1781962623${key}`);
      assert.equal(res.statusCode, 200);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
});

suite(c.blue('REPLAY PARSING'), async () => {
  const tests = [detailsApi.result];
  const matchData = tests[0];
  before(async () => {
    // The test match is not a pro match, but we set the leagueid to 5399 so we get data in postgres
    // We could do this with a real pro match but we'd have to upload a new replay file
    // This also means it should trigger auto-parse as a "pro match"
    console.log('inserting and parsing:', matchData.match_id);
    const { parseJob } = await insertMatch(matchData, {
      type: 'api',
      origin: 'scanner',
    });
    assert.ok(parseJob);
    let notDone = true;
    let tries = 0;
    while (notDone && tries < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      tries += 1;
      console.log('waiting for replay parse... %s', tries);
      const row = await db.first().from('queue').where({ type: 'parse' });
      notDone = Boolean(row);
    }
  });
  test('should have api data in buildMatch', async () => {
    // ensure api data got inserted
    const match = await buildMatch(matchData.match_id, {});
    assert.ok(match);
    assert.ok(match.players);
    assert.ok(match.players[0]);
    assert.equal(match.players[0].kills, 8);
    assert.equal(match.players[0].hero_damage, 12234);
    assert.ok(match.start_time);
  });
  test('should have gcdata in buildMatch', async () => {
    // ensure gcdata got inserted
    const match = (await buildMatch(matchData.match_id, {})) as ParsedMatch;
    assert.ok(match);
    assert.ok(match.players);
    assert.ok(match.players[0]);
    assert.equal(match.players[0].party_size, 10);
    assert.equal(match.replay_salt, 1);
  });
  test('should have parse data in buildMatch', async () => {
    // ensure parse data got inserted
    const match = (await buildMatch(matchData.match_id, {})) as ParsedMatch;
    assert.ok(match);
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
  test('should have parse match data in postgres', async () => {
    // Assert that the pro data (with parsed info) is in postgres
    const proMatch = await db.raw('select * from matches where match_id = ?', [
      matchData.match_id,
    ]);
    const proMatchPlayers = await db.raw(
      'select * from player_matches where match_id = ?',
      [matchData.match_id],
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
  test('should have parse data for non-anonymous players in player_caches', async () => {
    const result = await cassandra.execute(
      'SELECT * from player_caches WHERE match_id = ? ALLOW FILTERING',
      [matchData.match_id],
      { prepare: true },
    );
    // Assert that parsed data is in player_caches
    assert.ok(result.rows[0].stuns);

    // Assert that gc data is in player_caches
    assert.ok(result.rows[0].party_size);

    // There should be 7 rows in player_caches for this match since there are 3 anonymous players
    assert.equal(result.rows.length, 7);
  });
});

/*
describe(c.blue('generateMatchups'), () => {
  it('should generate matchups', () => {
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
  });
});
*/
after(() => {
  process.exit(0);
});
