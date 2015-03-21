var processors = require('./processors');
var jobs = require('./redis').jobs;
console.log("[PARSER] starting parser");
jobs.process('parse', 2, processors.processParse);
//todo choose parallelism based on system config