var tasks = require('./tasks');

var args = process.argv.slice(2);
var functionMap = {
    "fullhistory": tasks.getFullMatchHistory,
    "unnamed": tasks.updateSummaries,
    "constants": tasks.generateConstants,
    "untracked": tasks.untrackPlayers,
    "unparsed": tasks.unparsed
};
functionMap[args[0]](function(err, res) {
    process.exit(err);
});