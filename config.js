/**
 * File managing configuration for the application
 **/
const dotenv = require('dotenv');
const fs = require('fs');
try
{
    if (fs.statSync('.env'))
    {
        dotenv.load();
    }
}
catch(e)
{
    // Swallow exceptions due to no .env file
}

var defaults = {
    "STEAM_API_KEY": "", //for API reqs, in worker
    "STEAM_USER": "", //for getting replay salt/profile data, in retriever
    "STEAM_PASS": "", //make sure to wrap in double quotes in .env if it contains special characters
    "RECAPTCHA_PUBLIC_KEY": "", //for preventing automated requests, in web
    "RECAPTCHA_SECRET_KEY": "",
    "STRIPE_SECRET": "", //for donations, in web
    "STRIPE_PUBLIC": "",
    "BRAIN_TREE_MERCHANT_ID": "",
    "BRAIN_TREE_PUBLIC_KEY": "",
    "BRAIN_TREE_PRIVATE_KEY": "",
    "RETRIEVER_SECRET": "", //string to use as shared secret with retriever/parser
    "SESSION_SECRET": "secret to encrypt cookies with", //string to encrypt cookies
    "ROOT_URL": "http://localhost:5000", //base url to redirect to after steam oauth login
    "WORK_URL": "http://localhost:5400", //url to request work from (for worker nodes)
    "START_SEQ_NUM": "", //truthy: use sequence number stored in redis, else: use approximate value from live API
    "NODE_ENV": "development",
    "FRONTEND_PORT": "5000",
    "RETRIEVER_PORT": "5100",
    "PARSER_PORT": "5200",
    "PROXY_PORT": "5300",
    "WORK_PORT": "5400",
    "SCANNER_PORT": "5500",
    "PARSER_HOST": "http://localhost:5600", //host of the parse server
    "POSTGRES_URL": "postgresql://postgres:postgres@localhost/yasp", //connection string for PostgreSQL
    "POSTGRES_TEST_URL": "postgresql://postgres:postgres@localhost/yasp_test",
    "READONLY_POSTGRES_URL": "postgresql://readonly:readonly@localhost/yasp", //readonly connection string for PostgreSQL
    "REDIS_URL": "redis://127.0.0.1:6379/0", //connection string for Redis
    "REDIS_TEST_URL": "redis://127.0.0.1:6379/1",
    "CASSANDRA_URL": "cassandra://localhost/yasp", //connection string for Cassandra
    "CASSANDRA_TEST_URL": "cassandra://localhost/yasp_test",
    "RETRIEVER_HOST": "localhost:5100", //The host of the retriever (access to Dota 2 GC data)
    "UNTRACK_DAYS": 14, //The number of days a user is tracked for after every visit
    "GOAL": 5, //The cheese goal
    "PROXY_URLS": "", //comma separated list of proxy urls to use
    "STEAM_API_HOST": "api.steampowered.com", //the list of hosts to fetch Steam API data from
    "ROLE": "", //for specifying the file that should be run when entry point is invoked
    "GROUP": "", //for specifying the group of apps that should be run when entry point is invoked
    "MMSTATS_DATA_INTERVAL": 3, //minutes between requests for MMStats data
    "DEFAULT_DELAY": 1000, // delay between API requests (default: 1000)
    "SCANNER_DELAY": 2000, //delay for scanner API requests (stricter rate limit)
    "SCANNER_PARALLELISM": 1, //Number of simultaneous API requests to make in scanner
    "MMR_PARALLELISM": 10,
    "PARSER_PARALLELISM": 1,
    "PLAYER_MATCH_LIMIT": 50000, //max results to return from player matches
    "BENCHMARK_RETENTION_MINUTES": 60, //minutes in block to retain benchmark data for percentile
    "PROVIDER": "", //The cloud provider used by the application (determines how environment data is downloaded)
    "UI_HOST": "", //The host of the UI, redirect traffic from / and /return here
    "ENABLE_RECAPTCHA": "", //set to enable the recaptcha on the Request page
    "ENABLE_ADS": "", //set to turn on ads
    "ENABLE_MATCH_CACHE": "", // set to enable caching matches (Redis)
    "ENABLE_RANDOM_MMR_UPDATE": "", //set to update MMRs after ranked matches
    "ENABLE_POSTGRES_MATCH_STORE_WRITE": "1", //set to enable writing match data to postgres (default on)
    "ENABLE_CASSANDRA_MATCH_STORE_READ": "1", //set to enable reading match data from cassandra
    "ENABLE_CASSANDRA_MATCH_STORE_WRITE": "1", //set to enable writing match data to cassandra
};
//ensure that process.env has all values in defaults, but prefer the process.env value
for (var key in defaults)
{
    process.env[key] = (key in process.env) ? process.env[key] : defaults[key];
}
if (process.env.NODE_ENV === "development")
{
    //force PORT to null in development so we can run multiple web services without conflict
    process.env.PORT = "";
}
if (process.env.NODE_ENV === 'test')
{
    process.env.PORT = ""; //use service defaults
    process.env.POSTGRES_URL = process.env.POSTGRES_TEST_URL;
    process.env.CASSANDRA_URL = process.env.CASSANDRA_TEST_URL;
    process.env.REDIS_URL = process.env.REDIS_TEST_URL;
    process.env.SESSION_SECRET = "testsecretvalue";
    process.env.ENABLE_MATCH_CACHE = 1;
    process.env.FRONTEND_PORT = 5001;
    process.env.PARSER_PORT = 5201;
}
//now processes can use either process.env or config
module.exports = process.env;
