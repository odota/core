/**
 * File managing configuration for the application
 **/
var dotenv = require('dotenv');
dotenv.config(
{
    silent: true
});
dotenv.load();
var defaults = {
    "STEAM_API_KEY": "", //for API reqs, in worker
    "STEAM_USER": "", //for getting replay salt/profile data, in retriever
    "STEAM_PASS": "", //make sure to wrap in double quotes if it contains special characters
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
    "START_SEQ_NUM": "", //REDIS: use redis number, truthy: use sequence number, else: use auto
    "NODE_ENV": "development",
    "FRONTEND_PORT": "5000",
    "RETRIEVER_PORT": "5100",
    "PARSER_PORT": "5200",
    "PROXY_PORT": "5300",
    "WORK_PORT": "5400",
    "SCANNER_PORT": "5500",
    "POSTGRES_URL": "postgresql://yasp:yasp@localhost/yasp",
    "REDIS_URL": "redis://127.0.0.1:6379/0",
    "CASSANDRA_URL": "cassandra://localhost/yasp",
    "RETRIEVER_HOST": "localhost:5100",
    "UNTRACK_DAYS": 7,
    "GOAL": 5,
    "PROXY_URLS": "", //comma separated list of proxy urls to use
    "STEAM_API_HOST": "api.steampowered.com",
    "ROLE": "", //for specifying a node type
    "MMSTATS_DATA_INTERVAL": 3, //minutes between requests for MMStats data
    "DEFAULT_DELAY": 1000, // delay between API requests (default: 1000)
    "SCANNER_DELAY": 300, //delay for scanner API requests (more time-sensitive)
    "PLAYER_MATCH_LIMIT": 50000, //max results to return from player matches
    "BENCHMARK_RETENTION_HOURS": 3, //hours in block to retain benchmark data
    "MATCH_RATING_RETENTION_HOURS": 24, //hours in block to retain match rating data
    "ICON_PATH": "/public/images/yasp-icon.svg", //path to the icon
    "PROVIDER": "", //The cloud provider used by the application (determines how environment data is downloaded)
    "ENABLE_RECAPTCHA": "", //set to enable the recaptcha on the Request page
    "ENABLE_ADS": "", //set to turn on ads
    "ENABLE_PRO_PARSING": "", // set to parse pro matches from sequential API
    "ENABLE_MATCH_CACHE": "", // set to enable caching matches
    "ENABLE_PLAYER_CACHE": "", // set to enable caching players
    "ENABLE_INSERT_ALL_MATCHES": "", //set to enable inserting all matches
    "ENABLE_RANDOM_MMR_UPDATE": "", //set to randomly update MMRs in ranked matches
    "ENABLE_SPA_MODE": "", //set to enable single page application mode for web
    "ENABLE_CASSANDRA_MATCH_STORE_READ": "", //set to enable using cassandra for match data store
};
//ensure that process.env has all values in defaults, but prefer the process.env value
for (var key in defaults)
{
    process.env[key] = process.env[key] || defaults[key];
}
if (process.env.NODE_ENV === "development")
{
    //force PORT to null in development so we can run multiple web services without conflict
    process.env.PORT = "";
}
//now processes can use either process.env or config
module.exports = process.env;
