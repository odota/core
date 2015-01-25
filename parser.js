var utility = require('./utility');
var processors = require('./processors');
utility.jobs.process('parse', process.env.STREAM ? processors.processParseStream : processors.processParse);