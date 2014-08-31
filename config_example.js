var config = {};

config.steam_name = "";
config.steam_user = "";
config.steam_pass = "";
config.steam_guard_code = "";
config.cwd = "/home/codio/workspace/Dota2ApiGetter/"; // Because node-forever is silly.

config.request_timeout = 1000 * 30;
config.steam_response_timeout = 1000 * 30;

config.mongodb_host = "localhost";
config.mongodb_port = 27017;

config.steam_api_key = "";

config.account_ids = [
    "102344608"
];

//Number of matches to request per API call
config.matchCount = 2;

config.replaysFolder = "";

config.logFile = 'api.log';
config.logEmail = '';

module.exports = config;