var config = require('./config');
var role = config.ROLE || config.FOREMAN_WORKER_NAME.split(".")[0];
console.log(role);
//constants are currently built pre-run and written to file
//web requires constants
//worker requires constants (fullhistory needs to iterate through heroes)
//parseManager requires constants (processparse needs to map combat log names to hero ids)
//buildSets currently built by worker, re-runs every 3 minutes, includes getRetriever, getParser, which could be separated
//scanner requires buildSets in order to avoid leaking players, retries until available
//parseManager requires getRetrievers to get replay url, retries until available
//parseManager requires getParsers, since we need to set concurrency before starting, retries until available
//retriever, parser, proxy are independent
require("./" + role + ".js");