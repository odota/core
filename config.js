//load environment variables and export them
var dotenv = require('dotenv');
var fs = require('fs');
var config = {};
try {
    var file = fs.readFileSync('./.env');
    config = dotenv.parse(file); // passing in a buffer
}
catch (e) {
    console.log(e);
}
var defaults = {
    "STEAM_API_KEY": null,
    "STEAM_USER": null,
    "STEAM_PASS": null,
    "RECAPTCHA_PUBLIC_KEY": null,
    "RECAPTCHA_SECRET_KEY": null,
    "SESSION_SECRET": "somesecretvalue",
    "ROOT_URL": "http://localhost:5000",
    "START_SEQ_NUM": "AUTO",
    "KUE_USER": "user",
    "KUE_PASS": "pass",
    "NODE_ENV": "development",
    "PORT": 5000, //this value must be set in .env to make nf use it!
    "RETRIEVER_PORT": 5100,
    "PARSER_PORT": 5200,
    "REGISTRY_PORT": 5300,
    "MONGO_URL": "mongodb://localhost/dota",
    "REDIS_URL": "redis://127.0.0.1:6379/0",
    "REPLAY_DIR": "./replays/",
    "REGISTRY_HOST": "localhost",
    "RETRIEVER_HOST": "localhost:5100",
    "AWS_S3_BUCKET": false,
    "AWS_ACCESS_KEY_ID": false,
    "AWS_SECRET_ACCESS_KEY": false,
    "STEAM_GUARD_CODE": false,
    "UNTRACK_DAYS": 3,
    "PAYPAL_ID": null,
    "PAYPAL_SECRET": null,
    "GOAL": 5
};
for (var key in config) {
    defaults[key] = config[key];
}
for (var key in process.env) {
    defaults[key] = process.env[key];
}
//console.log(defaults) // object { API : 'http://this.is.a/example' }
module.exports = defaults;