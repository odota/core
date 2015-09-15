var processMmr = require('./processMmr');
var utility = require('./utility');
var r = require('./redis');
var kue = r.kue;
var jobs = r.jobs;
jobs.process('mmr', 10, processMmr);
utility.cleanup(jobs, kue, "mmr");