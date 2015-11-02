var pm2 = require('pm2');
var async = require('async');
var config = require('./config');
var args = process.argv.slice(2);
var services = require("./deploy.json");
var apps = services.apps;
if (config.ROLE === "retriever" || config.ROLE == "proxy") {
    require('./' + config.ROLE + ".js");
}
else {
    pm2.connect(function() {
        //TODO reload if procs exist, or just manually do pm2 reload all after intial deploy
        /*
        pm2.list(function(err, list){
            console.log(list);
        })
        */
        async.each(apps, function(app, cb) {
            if (args[0] === "all" || app.role === config.ROLE || app.role === args[0]) {
                pm2.start(app, cb);
            }
            else {
                cb();
            }
        }, function() {
            pm2.disconnect();
            process.exit(0);
        });
    });
}
