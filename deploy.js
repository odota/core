var pm2 = require('pm2');
var async = require('async');
var config = require('./config');
var args = process.argv.slice(2);
var manifest = require('./package.json');
var cp = require('child_process');
if (config.PROVIDER === "gce")
{
    cp.execSync('curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/yasp/.env');
}
if (config.ROLE)
{
    //if role variable is set just run that script
    require('./' + config.ROLE + ".js");
}
else if (args[0])
{
    //if argument supplied use pm2 to run processes in that group
    pm2.connect(function()
    {
        async.each(manifest.apps, function start(app, cb)
        {
            if (args[0] === app.role)
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
