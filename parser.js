var processors = require('./processors');
var jobs = require('./redis').jobs;
console.log("[PARSER] starting parser");
jobs.process('parse', 7, processors.processParse);
jobs.process('request_parse', processors.processParse);
//todo choose parallelism based on system config
