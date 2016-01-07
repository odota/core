var pm2 = require('pm2');
var async = require('async');
var config = require('./config');
var args = process.argv.slice(2);
var services = {
    "apps": [
        {
            "script": "skill.js",
            "role": "core"
      },
        {
            "script": "mmr.js",
            "role": "core"
      },
        {
            "script": "scanner.js",
            "role": "core"
      },
        {
            "script": "worker.js",
            "role": "core"
      },
        {
            "script": "parser.js",
            "role": "core",
            "exec_mode": "cluster",
            "instances": 0
      },
        {
            "script": "cacher.js",
            "role": "core",
            "exec_mode": "cluster",
            "instances": 0
      },
        {
            "script": "fullhistory.js",
            "role": "core",
            "exec_mode": "cluster",
            "instances": 0
      },
        {
            "script": "web.js",
            "role": "core",
            "exec_mode": "cluster",
            "instances": 0
      }]
};
var apps = services.apps;
if (config.ROLE === "retriever" || config.ROLE == "proxy")
{
    //don't use pm2 for these node types
    require('./' + config.ROLE + ".js");
}
else
{
    pm2.connect(function()
    {
        async.each(apps, function(app, cb)
        {
            if (args[0] === "all" || app.role === config.ROLE || app.role === args[0])
            {
                if (app.script === "fullhistory.js")
                {
                    //scale fh worker based on number of steam proxies
                    app.instances = config.STEAM_API_HOST.split(",").length;
                }
                pm2.start(app, cb);
            }
            else
            {
                cb();
            }
        }, function()
        {
            pm2.disconnect();
            process.exit(0);
        });
    });
}