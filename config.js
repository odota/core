var defaults = {
    "STEAM_API_KEY": null,
    "STEAM_USER": null,
    "STEAM_PASS": null,
    "RECAPTCHA_PUBLIC_KEY": null,
    "RECAPTCHA_SECRET_KEY": null,
    "PAYPAL_ID": null,
    "PAYPAL_SECRET": null,
    "RETRIEVER_SECRET": "shared_secret_with_retriever",
    "SESSION_SECRET": "secret to encrypt cookies with",
    "ROOT_URL": "http://localhost:5000",
    "START_SEQ_NUM": "AUTO",
    "KUE_USER": "user",
    "KUE_PASS": "pass",
    "NODE_ENV": "development",
    "LANG": "en_US.UTF-8", //this value ensures that encoding is set properly on the parser (LANG is not present when running under upstart)
    "PORT": 5000, //this value must be set in .env to make nf set it in process.env over a preset PORT env var!
    "RETRIEVER_PORT": 5100,
    "PARSER_PORT": 5200,
    "REGISTRY_PORT": 5300,
    "MONGO_URL": "mongodb://localhost/dota",
    "REDIS_URL": "redis://127.0.0.1:6379/0",
    "REPLAY_DIR": "./replays/",
    "REGISTRY_HOST": "localhost",
    "RETRIEVER_HOST": "localhost:5100",
    "PARSER_HOST": "localhost:5200",
    "UNTRACK_DAYS": 7,
    "GOAL": 5,
    "PROXY_URLS": "", //comma separated list of proxy urls to use
    "STEAM_API_HOST": "api.steampowered.com",
    //the following are deprecated
    "AWS_S3_BUCKET": false,
    "AWS_ACCESS_KEY_ID": false,
    "AWS_SECRET_ACCESS_KEY": false,
    "STEAM_GUARD_CODE": false
};
//nf puts values in .env into process.env
//use dotenv to read .env and overwrite defaults if running a task (code not run by nf)
var dotenv = require('dotenv');
var fs = require('fs');
try {
    var fileConfig = {};
    var file = fs.readFileSync('./.env');
    fileConfig = dotenv.parse(file); // passing in a buffer
    for (var key in fileConfig) {
        defaults[key] = fileConfig[key];
    }
}
catch (e) {
    console.log(e);
}
//ensure that process.env has all values in defaults, but prefer the process.env value
for (var key in defaults) {
    process.env[key] = process.env[key] || defaults[key];
}
module.exports = process.env;
