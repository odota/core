var config = require('./config');
require("./"+(config.ROLE || config.FOREMAN_WORKER_NAME.split(".")[0])+".js");