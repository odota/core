var config = require('./config');
var role = config.ROLE || config.FOREMAN_WORKER_NAME.split(".")[0];
console.log(role);
require("./"+role+".js");