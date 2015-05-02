var config = require('./config');
var role = config.ROLE || config.FOREMAN_WORKER_NAME.split(".")[0];
console.log(role);
//constants are currently built pre-run and written to file
//web requires constants
//worker requires constants (fullhistory needs to iterate through heroes)
//parseManager requires constants (processparse needs to map combat log names to hero ids, requires a retriever to get replay url)
//parseManager will retry until it finds at least one parser, since we don't know what concurrency to run at before
//scanner should require buildSets, we might leak matches if we dont have a tracked player set while scanning
//retriever, parser, proxy are independent
require("./" + role + ".js");