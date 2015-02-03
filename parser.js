var utility = require('./utility');
var processors = require('./processors');
var jobs = utility.jobs;
console.log("[PARSER] starting parser");
jobs.process('parse', process.env.STREAM ? processors.processParseStream : processors.processParse);
