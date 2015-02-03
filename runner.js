var dotenv = require('dotenv');
dotenv.load();
var tasks = require('./tasks');
var args = process.argv.slice(2);
var functionMap = {
    "fullhistory": tasks.getFullMatchHistory,
    "updatenames": tasks.updateNames,
    "constants": tasks.generateConstants,
    "unparsed": tasks.unparsed
};
functionMap[args[0]](function(err, res) {
    process.exit(err);
});