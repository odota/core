var pm2 = require('pm2');
var async = require('async');
var config = require('./config');
var args = process.argv.slice(2);
var manifest = require('./package.json');
if (config.ROLE)
{
    //if role variable is set just run that script
    require('./' + config.ROLE + ".js");
}
else
{
    //specific role not set, just use pm2 to run the production config
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