var pm2 = require('pm2');
var async = require('async');
var config = require('./config');
var args = process.argv.slice(2);
var manifest = require('./package.json');
if (config.ROLE === "retriever" || config.ROLE == "proxy")
{
    //don't use pm2 for these roles
    require('./' + config.ROLE + ".js");
}
else
{
    pm2.connect(function()
    {
        async.each(manifest.apps, start, exit);
    });
}

function exit(err)
{
    if (err)
    {
        console.error(err);
    }
    pm2.disconnect();
}

function start(app, cb)
{
    if (args[0] === app.role || (!args[0] && app.role === "core"))
    {
        console.log(app.script, app.instances);
        pm2.start(app.script,
        {
            instances: app.instances
        }, cb);
    }
}