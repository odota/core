/*
 * Utility for re-parsing matches that have already been parsed once (necessary when parser updated)
 */
var fs = require('fs'),
    async = require('async'),
    spawn = require('child_process').spawn;

var files = fs.readdirSync("./replays/")

function parseFile(file, cb) {
    var cp = spawn(
        "java",
        ["-jar",
         "./parser/target/stats-0.1.0.jar",
         "./replays/" + file
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