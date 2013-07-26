// Configure and mv to config.js
var config = {};

config.steam_name = "";
config.steam_user = "";
config.steam_pass = "";
config.steam_guard_code = "";
config.cwd = "/a/b/c/"; // Because node-forever is silly.

config.request_timeout = 1000 * 30;
config.steam_response_timeout = 1000 * 30;

config.mongodb_host = "localhost";
config.mongodb_port = 27017;

module.exports = config;