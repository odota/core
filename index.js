var config = require('./config');
var role = config.ROLE || config.FOREMAN_WORKER_NAME.split(".")[0];
console.log(role);
//TODO parseManager and scanner should buildSets before starting
//parseManager requires at least one parser in order to operate, it will retry until it finds at least one
//scanner can operate, but we might leak matches if we dont have a tracked player set while scanning
require("./"+role+".js");