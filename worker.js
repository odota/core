var processApi = require('./processApi');
var r = require('./redis');
var jobs = r.jobs;
var kue = r.kue;
var updateNames = require('./tasks/updateNames');
var buildSets = require('./buildSets');
var utility = require('./utility');
var invokeInterval = utility.invokeInterval;
var numCPUs = require('os').cpus().length;
console.log("[WORKER] starting worker");
invokeInterval(buildSets, 60 * 1000);
jobs.watchStuckJobs();
//process requests (api call, waits for parse to complete)
jobs.process('request', numCPUs, processApi);
utility.cleanup(jobs, kue, 'request');
//updatenames queues an api request
//probably should have name updating occur in a separate service
//jobs.process('api', processApi);
//invokeInterval(updateNames, 60 * 1000);
//invokeInterval(constants, 15 * 60 * 1000);
