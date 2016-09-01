/**
 * Entry point for the application.
 **/
var args = process.argv.slice(2);
var group = args[0] || process.env.GROUP;
var cp = require('child_process');
if (process.env.PROVIDER === "gce")
{
    cp.execSync('curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/yasp/.env');
}
if (process.env.ROLE)
{
    //if role variable is set just run that script
    require('./svc/' + process.env.ROLE + ".js");
}
else if (group)
{
    var pm2 = require('pm2');
    var async = require('async');
    var manifest = require('./profiles/full.json').apps;
    pm2.connect(function()
    {
        async.each(manifest, function start(app, cb)
        {
            if (group === app.group)
            {
                console.log(app.script, app.instances);
                pm2.start(app.script,
                {
                    instances: app.instances
                }, cb);
            }
        }, function exit(err)
        {
            if (err)
            {
                console.error(err);
            }
            pm2.disconnect();
        });
    });
}
else
{
    process.stdin.resume();
}
