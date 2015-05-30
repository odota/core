var config = require('./config');
var role = config.ROLE || config.FOREMAN_WORKER_NAME.split(".")[0];
console.log(role);
//constants are currently built pre-run and written to file
//buildSets currently built pre-run and saved to redis, worker re-runs every 3 minutes, includes getRetriever, getParser, which could be separated
//web requires constants
//worker requires constants (fullhistory needs to iterate through heroes)
//parseManager requires constants (processparse needs to map combat log names to hero ids)
//scanner requires buildSets in order to avoid leaking players
//parseManager requires getRetrievers to get replay url
//parseManager requires getParsers, since we need to set concurrency before starting
//retriever, parser, proxy are independent
require("./" + role + ".js");