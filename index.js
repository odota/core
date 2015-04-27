var config = require('./config');
var role = config.ROLE || config.FOREMAN_WORKER_NAME.split(".")[0];
console.log(role);
//web requires constants
//worker requires constants (fullhistory)
//parseManager requires constants (processparse)
//parseManager should require parsers, it will retry until it finds at least one
//scanner should require buildSets, we might leak matches if we dont have a tracked player set while scanning
//retriever, parser, proxy are independent
require("./" + role + ".js");