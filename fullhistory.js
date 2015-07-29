var processFullHistory = require('./processFullHistory');
var r = require('./redis');
var jobs = r.jobs;
jobs.process('fullhistory', processFullHistory);
