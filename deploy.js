var pm2 = require('pm2');
var async = require('async');
var config = require('./config');
var args = process.argv.slice(2);
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
        if (args[0])
        {
            start(args[0], args[1], exit);
        }
        else
        {
            async.each(lines, function(line, cb)
            {
                var app = line.split(':')[0];
                start(app, 1, cb);
            }, exit);
        }

        function exit(err)
        {
            if (err)
            {
                console.error(err);
            }
            pm2.disconnect();
            process.exit(Number(err));
        }
    });
}

function start(app, i, cb)
{
    var script = app + ".js";
    var n = i || 1;
    console.log(app, n);
    pm2.start(script,
    {
        instances: n
    }, cb);
}