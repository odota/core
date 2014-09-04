var fs = require('fs'),
    async = require('async'),
    config = require('./config'),
    spawn = require('child_process').spawn;

var files = fs.readdirSync(config.replaysFolder)

function parseFile(file, cb) {
    var cp = spawn(
                "java",
                ["-jar",
                 "stats-0.1.0.jar",
                 config.replaysFolder + file
                ]
            );

            cp.stderr.on('data', function (data) {
                cb(data)
            });

            cp.on('close', function (code) {
                cb(null, code)
            });
}

async.eachSeries(files, parseFile, function(err) {
    console.log(err)
})