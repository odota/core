var bull = require('bull');
var queue = bull('parse', 6379, '127.0.0.1');
queue.process(function(job, cb) {
    setTimeout(function() {
        console.log("completed %s", job.jobId);
        cb();
    }, 1000);
});
/*
queue.getNextJob().then(function(job) {
    console.log("next job: %s", job.jobId);
});
*/
setInterval(function() {
    queue.add({
        msg: "Hello"
    });
}, 500);
setInterval(function() {
    queue.getWaiting().then(function(count) {
        console.log("waiting:%s", count.length);
    });
    queue.getActive().then(function(count) {
        console.log("active:%s", count.length);
    });
    queue.getDelayed().then(function(count) {
        console.log("delayed:%s", count.length);
    });
    queue.getCompleted().then(function(count) {
        console.log("completed:%s", count.length);
    });
    queue.getFailed().then(function(count) {
        console.log("failed:%s", count.length);
    });
}, 1000);