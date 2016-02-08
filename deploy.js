var pm2 = require('pm2');
var async = require('async');
var config = require('./config');
//var args = process.argv.slice(2);
var fs = require('fs');
var lines = fs.readFileSync('./Procfile.dev').toString().split("\n");
if (config.ROLE === "retriever" || config.ROLE == "proxy")
{
    //don't use pm2 for these node types
    require('./' + config.ROLE + ".js");
}
else
{
    pm2.connect(function()
    {
        async.each(lines, function(line, cb)
        {
            var app = line.split(':')[0];
            var script = app + ".js";
            //manually set number of instances for types
            //0 starts equal to number of cores
            //null doesn't start any
            var instances = {
                web: 4,
                fullhistory: 4,
                cacher: 2,
                retriever: null,
                proxy: null,
            };
            if (instances[app] !== null)
            {
                var n = instances[app] || 1;
                console.log(app, n);
                pm2.start(script,
                {
                    instances: n
                }, cb);
            }
            else
            {
                cb();
            }
        }, function(err)
        {
            if (err)
            {
                console.error(err);
            }
            pm2.disconnect();
            process.exit(Number(err));
        });
    });
}