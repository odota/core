var processors = require('./processors');
var jobs = require('./redis').jobs;
console.log("[PARSER] starting parser");
jobs.process('parse', 3, processors.processParse);
//todo choose parallelism based on system config