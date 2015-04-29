var defaults = {
    "STEAM_API_KEY": null, //for API reqs, in worker
    "STEAM_USER": null, //for getting replay salt/profile data, in retriever
    "STEAM_PASS": null,
    "RECAPTCHA_PUBLIC_KEY": null, //for preventing automated requests, in web
    "RECAPTCHA_SECRET_KEY": null,
    "PAYPAL_ID": null, //for donations, in web
    "PAYPAL_SECRET": null,
    "RETRIEVER_SECRET": "shared_secret_with_retriever",
    "SESSION_SECRET": "secret to encrypt cookies with",
    "ROOT_URL": "http://localhost:5000",
    "START_SEQ_NUM": "", //REDIS: use redis number, truthy: use sequence number, else: use auto
    "KUE_USER": "user",
    "KUE_PASS": "pass",
    "NODE_ENV": "development",
    "LANG": "en_US.UTF-8", //this value ensures that encoding is set properly on the parser (LANG is not present when running under upstart)
    "PORT": 5000, //this value must be set in .env to make nf set it in process.env over a preset PORT env var!
    "RETRIEVER_PORT": 5100,
    "PARSER_PORT": 5200,
    "MONGO_URL": "mongodb://localhost/dota",
    "REDIS_URL": "redis://127.0.0.1:6379/0",
    "RETRIEVER_HOST": "localhost:5100",
    "PARSER_HOST": "localhost:5200",
    "UNTRACK_DAYS": 7,
    "GOAL": 5,
    "PROXY_URLS": "", //comma separated list of proxy urls to use
    "STEAM_API_HOST": "api.steampowered.com",
    "ROLE": "", //for specifying a node type
    //the following are deprecated
    "AWS_S3_BUCKET": false,
    "AWS_ACCESS_KEY_ID": false,
    "AWS_SECRET_ACCESS_KEY": false,
    "STEAM_GUARD_CODE": false
};
//nf puts values in .env into process.env
//ensure that process.env has all values in defaults, but prefer the process.env value
for (var key in defaults) {
    process.env[key] = process.env[key] || defaults[key];
}
//now processes can use either process.env or config
module.exports = process.env;
