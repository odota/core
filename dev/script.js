var utility = require('../utility');
var queueReq = utility.queueReq;
var r = require('../redis');
var jobs = r.jobs;
queueReq(jobs, "fullhistory", {account_id:64997477}, function(err, job) {
process.exit(Number(err));
});