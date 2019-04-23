/**
 * File managing configuration for the application
 * */
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync('.env')) {
  dotenv.load();
}

const defaults = {
  STEAM_API_KEY: '', // for API reqs, in worker
  STEAM_USER: '', // for getting replay salt/profile data, in retriever
  STEAM_PASS: '',
  ROLE: '', // for specifying the file that should be run when entry point is invoked
  GROUP: '', // for specifying the group of apps that should be run when entry point is invoked
  START_SEQ_NUM: '', // truthy: use sequence number stored in redis, else: use approximate value from live API
  PROVIDER: '', // The cloud provider used by the application (determines how environment data is downloaded)
  STEAM_ACCOUNT_DATA: '', // The URL to read Steam account data from
  NODE_ENV: 'development',
  FRONTEND_PORT: '5000',
  RETRIEVER_PORT: '5100',
  PARSER_PORT: '5200',
  PROXY_PORT: '5300',
  ROOT_URL: 'http://localhost:5000', // base url to redirect to after steam oauth login
  RETRIEVER_HOST: 'localhost:5100', // Comma separated list of retriever hosts (access to Dota 2 GC data)
  GCDATA_RETRIEVER_HOST: '', // Comma separated list of retriever hosts dedicated for gcdata job
  PARSER_HOST: 'http://localhost:5600', // host of the parse server
  UI_HOST: '', // The host of the UI, target of /logout and /return
  PROXY_URLS: '', // comma separated list of proxy urls to use
  STEAM_API_HOST: 'api.steampowered.com', // comma separated list of hosts to fetch Steam API data from
  POSTGRES_URL: 'postgresql://postgres:postgres@localhost/yasp', // connection string for PostgreSQL
  POSTGRES_TEST_URL: 'postgresql://postgres:postgres@localhost/yasp_test',
  READONLY_POSTGRES_URL: 'postgresql://readonly:readonly@localhost/yasp', // readonly connection string for PostgreSQL
  REDIS_URL: 'redis://127.0.0.1:6379/0', // connection string for Redis
  REDIS_TEST_URL: 'redis://127.0.0.1:6379/1',
  CASSANDRA_URL: 'cassandra://localhost/yasp', // connection string for Cassandra
  CASSANDRA_TEST_URL: 'cassandra://localhost/yasp_test',
  ELASTICSEARCH_URL: 'localhost:9200',
  INIT_POSTGRES_HOST: 'localhost',
  INIT_CASSANDRA_HOST: 'localhost',
  RETRIEVER_SECRET: '', // string to use as shared secret with retriever/parser
  SESSION_SECRET: 'secret to encrypt cookies with', // string to encrypt cookies
  COOKIE_DOMAIN: '', // domain to use for the cookie.  Use e.g. '.opendota.com' to share cookie across subdomains
  UNTRACK_DAYS: 30, // The number of days a user is tracked for after every visit
  GOAL: 5, // The cheese goal
  MMSTATS_DATA_INTERVAL: 3, // minutes between requests for MMStats data
  DEFAULT_DELAY: 1000, // delay between API requests
  SCANNER_DELAY: 2000, // delay for scanner API requests (stricter rate limit)
  MMR_PARALLELISM: 10, // Number of simultaneous MMR requests to make (per retriever)
  PARSER_PARALLELISM: 1, // Number of simultaneous parse jobs to run (per parser)
  BENCHMARK_RETENTION_MINUTES: 60, // minutes in block to retain benchmark data for percentile
  GCDATA_PERCENT: 0, // percent of inserted matches to randomly queue for GC data
  SCANNER_PERCENT: 100, // percent of matches to insert from scanner
  PUBLIC_SAMPLE_PERCENT: 10, // percent of public matches to sample in DB
  SCENARIOS_SAMPLE_PERCENT: 100, // percent of parsed matches to sample for scenarios
  BENCHMARKS_SAMPLE_PERCENT: 100, // percent of parsed matches to sample for benchmarks
  ENABLE_MATCH_CACHE: '', // set to enable caching matches in Redis
  ENABLE_PLAYER_CACHE: 1, // enable/disable player aggregation caching
  ENABLE_RANDOM_MMR_UPDATE: '', // set to request MMR updates after ranked matches
  MAXIMUM_AGE_SCENARIOS_ROWS: 4, // maximum allowed age of scenarios rows in weeks
  MATCH_CACHE_SECONDS: 60, // number of seconds to cache matches
  PLAYER_CACHE_SECONDS: 1800, // number of seconds to cache player aggregations
  SCANNER_PLAYER_PERCENT: 100, // percent of matches from scanner to insert player account IDs for (discover new player account IDs)
  ENABLE_RETRIEVER_ADVANCED_AUTH: '', // set to enable retriever two-factor and SteamGuard authentication,
  ENABLE_API_LIMIT: '', // if truthy, API calls after exceeding API_FREE_LIMIT are blocked
  API_FREE_LIMIT: 50000, // number of api requests per month before 429 is returned. If using an API key, calls over this are charged.
  API_BILLING_UNIT: 100, // how many calls is equivalent to a unit of calls e.g. 100 calls per $0.01.
  API_KEY_PER_MIN_LIMIT: 300, // Rate limit per minute if using an API key
  NO_API_KEY_PER_MIN_LIMIT: 60, // Rate limit per minute if not using an API key
  ADMIN_ACCOUNT_IDS: '', // Whitelisted, comma separated account IDs to access /admin* routes
  BACKUP_RETRIEVER_PERCENT: 0, // percent of replay salts to fetch from backup data source
  GCDATA_PARALLELISM: 1, // Number of simultaneous GC match details requests to make (per retriever)
  STRIPE_SECRET: 'rk_test_gRqwhv4xqv0a1olp8kk8fZ94', // for stripe payment processing (kept on server)
  STRIPE_API_PLAN: 'plan_CgLthOgwrDgz2K', // plan id for stripe metering
  ES_SEARCH_PERCENT: 0, // % of users to roll out elasticsearch to
  WEBHOOK_TIMEOUT: 1000, // Timeout in milliseconds when calling a webhook
  WEBHOOK_FEED_INTERVAL: 2000, // Delay in milliseconds between reads from the match feed for the webhook handler.
  TRACKED_ACCOUNT_URL: '', // URL where account IDs of tracked players can be found
};
// ensure that process.env has all values in defaults, but prefer the process.env value
Object.keys(defaults).forEach((key) => {
  process.env[key] = (key in process.env) ? process.env[key] : defaults[key];
});
if (process.env.NODE_ENV === 'development') {
  // force PORT to null in development so we can run multiple web services without conflict
  process.env.PORT = '';
}
if (process.env.NODE_ENV === 'test') {
  process.env.PORT = ''; // use service defaults
  process.env.POSTGRES_URL = process.env.POSTGRES_TEST_URL;
  process.env.CASSANDRA_URL = process.env.CASSANDRA_TEST_URL;
  process.env.REDIS_URL = process.env.REDIS_TEST_URL;
  process.env.SESSION_SECRET = 'testsecretvalue';
  process.env.ENABLE_MATCH_CACHE = 1;
  process.env.FRONTEND_PORT = 5001;
  process.env.PARSER_PORT = 5201;
}
// now processes can use either process.env or config
module.exports = process.env;
