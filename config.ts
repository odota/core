/**
 * File managing configuration for the application
 * */
import 'dotenv/config';

const defaults = {
  STEAM_API_KEY: '', // for API reqs, in worker
  STEAM_USER: '', // for getting replay salt/profile data, in retriever
  STEAM_PASS: '', // for getting replay salt/profile data, in retriever
  ROLE: '', // for specifying the file that should be run when entry point is invoked
  GROUP: '', // for specifying the group of apps that should be run when entry point is invoked
  PROVIDER: '', // The cloud provider used by the application (determines how environment data is downloaded)
  STEAM_ACCOUNT_DATA: '', // The URL to read Steam account data from
  NODE_ENV: 'development',
  PORT: '', // Default port to use by services often set by the system
  FRONTEND_PORT: '5000', // Port to run the webserver/API on
  RETRIEVER_PORT: '5100', // Port to run the Steam GC retriever on
  PROXY_PORT: '5300', // Port to run the Steam API proxy on
  ROOT_URL: 'http://localhost:5000', // base url to redirect to after steam oauth login
  RETRIEVER_HOST: 'localhost:5100', // Comma separated list of retriever hosts (access to Dota 2 GC data)
  PARSER_HOST: 'localhost:5600', // host of the Java parse server
  UI_HOST: '', // The host of the UI, target of /logout and /return
  STEAM_API_HOST: 'api.steampowered.com', // comma separated list of hosts to fetch Steam API data from
  POSTGRES_URL: 'postgresql://postgres:postgres@localhost/yasp', // connection string for PostgreSQL
  READONLY_POSTGRES_URL: 'postgresql://readonly:readonly@localhost/yasp', // readonly connection string for PostgreSQL
  REDIS_URL: 'redis://127.0.0.1:6379/0', // connection string for Redis
  CASSANDRA_URL: 'cassandra://localhost/yasp', // connection string for Cassandra
  ELASTICSEARCH_URL: 'localhost:9200',
  RETRIEVER_SECRET: '', // string to use as shared secret with retriever/parser
  SESSION_SECRET: 'secret to encrypt cookies with', // string to encrypt cookies
  COOKIE_DOMAIN: '', // domain to use for the cookie.  Use e.g. '.opendota.com' to share cookie across subdomains
  UNTRACK_DAYS: '30', // The number of days a user is tracked for after every visit
  MMR_PARALLELISM: '1', // Number of simultaneous MMR requests to make (per retriever)
  PARSER_PARALLELISM: '1', // Number of simultaneous parse jobs to run (per parser)
  FULLHISTORY_PARALLELISM: '1', // Number of simultaneous fullhistory (player refresh) jobs to process
  GCDATA_PARALLELISM: '1', // Number of simultaneous GC match details requests to make (per retriever)
  BENCHMARK_RETENTION_MINUTES: '60', // minutes in block to retain benchmark data for percentile
  GCDATA_PERCENT: '0', // percent of inserted matches to randomly queue for GC data
  RATING_PERCENT: '20', // percent of ranked matches to update player ratings with
  SCANNER_PERCENT: '100', // percent of matches to insert from scanner
  PUBLIC_SAMPLE_PERCENT: '10', // percent of public matches to sample in DB
  SCENARIOS_SAMPLE_PERCENT: '100', // percent of parsed matches to sample for scenarios
  BENCHMARKS_SAMPLE_PERCENT: '100', // percent of matches to sample for benchmarks
  ENABLE_MATCH_CACHE: '', // set to enable caching matches in Redis
  MATCH_CACHE_SECONDS: '60', // number of seconds to cache matches
  ENABLE_PLAYER_CACHE: '', // enable/disable player aggregation caching
  PLAYER_CACHE_THRESHOLD: '50', // minimum number of matches to use player aggregation cache for
  ENABLE_RANDOM_MMR_UPDATE: '', // set to request MMR/rank tier updates after ranked matches
  MAXIMUM_AGE_SCENARIOS_ROWS: '4', // maximum allowed age of scenarios rows in weeks
  ENABLE_API_LIMIT: '', // if truthy, API calls after exceeding API_FREE_LIMIT are blocked
  API_FREE_LIMIT: '2000', // number of api requests per day before 429 is returned. If using an API key, calls over this are charged.
  API_BILLING_UNIT: '100', // how many calls is equivalent to a unit of calls e.g. 100 calls per $0.01.
  API_KEY_PER_MIN_LIMIT: '300', // Rate limit per minute if using an API key
  NO_API_KEY_PER_MIN_LIMIT: '60', // Rate limit per minute if not using an API key
  ADMIN_ACCOUNT_IDS: '', // Whitelisted, comma separated account IDs to access /admin* routes
  STRIPE_SECRET: 'rk_test_gRqwhv4xqv0a1olp8kk8fZ94', // for stripe payment processing (kept on server)
  STRIPE_API_PLAN: 'plan_CgLthOgwrDgz2K', // plan id for stripe metering
  ARCHIVE_S3_ENDPOINT: 'http://localhost:9000', // S3-compatible endpoint for archive storage (should have http prefix)
  ARCHIVE_S3_KEY_ID: 'minioadmin', // S3-compatible key ID to archive
  ARCHIVE_S3_KEY_SECRET: 'minioadmin', // S3-compatible key secret to archive
  ARCHIVE_PUBLIC_URL: '', // base URL to use for public archive reading (if not set, uses s3 client with endpoint)
  MATCH_ARCHIVE_S3_BUCKET: 'opendota', // name of the S3 bucket to archive parsed match blobs
  PLAYER_ARCHIVE_S3_BUCKET: 'opendota-players', // name of the S3 bucket to archive player match blobs
  BLOB_ARCHIVE_S3_BUCKET: 'opendota-blobs', // name of the S3 bucket to use for match data blobs
  ENABLE_PLAYER_ARCHIVE: '', // Allow reading/writing player match blobs to S3 storage
  DISABLE_REPARSE: '', // Disable reparsing matches that are already parsed
  DISABLE_REGCDATA: '', // Disable refetching new GC data on every request (cache it)
  DISABLE_REAPI: '', // Disable refetching new API data on every request
  API_KEY_GEN_THRESHOLD: '0', // Account ID requirement (delta from max) for generating API keys
  SERVICE_REGISTRY_HOST: '', // Host for external services to register themselves at
  USE_SERVICE_REGISTRY: '', // Use the service registry for determining gc, parser, and proxy urls
  SCANNER_OFFSET: '0', // Delay in match seq num value to run secondary scanner (to pick up missing matches)
  EXTERNAL: '', // Indicates that the service resides outside the registry and should report an external IP
  GOOGLE_CLOUD_PROJECT_ID: '', // Google Cloud project ID
};
if (process.env.NODE_ENV === 'development') {
  // force PORT to null in development so we can run multiple web services without conflict
  process.env.PORT = '';
}
if (process.env.NODE_ENV === 'test') {
  process.env.PORT = ''; // use service defaults
  process.env.POSTGRES_URL = process.env.POSTGRES_URL + '_test';
  process.env.CASSANDRA_URL = process.env.CASSANDRA_URL + '_test';
  process.env.REDIS_URL = process.env.REDIS_URL?.slice(0, -1) + '1';
  process.env.BLOB_ARCHIVE_S3_BUCKET = 'opendota-test' + Date.now();
  process.env.ARCHIVE_S3_KEY_ID = 'minioadmin';
  process.env.ARCHIVE_S3_KEY_SECRET = 'minioadmin';
  process.env.SESSION_SECRET = 'testsecretvalue';
  process.env.FRONTEND_PORT = '5001';
}

// Export the combined values
export const config = {
  ...defaults,
  ...process.env,
};
export default config;
