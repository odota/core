var processors = require('./processors');
var jobs = require('./redis').jobs;
console.log("[PARSER] starting parser");
jobs.process('parse', processors.processParse);
