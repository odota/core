var processMmr = require('./processMmr');
var r = require('./redis');
var jobs = r.jobs;
jobs.process('mmr', 10, processMmr);
