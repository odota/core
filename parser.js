var config = require('./config');
var express = require('express');
var request = require('request');
var fs = require('fs');
var spawn = require('child_process').spawn;
var progress = require('request-progress');
var app = express();
var capacity = require('os').cpus().length;
var port = config.PARSER_PORT;
var domain = require('domain');
var server = app.listen(port, function() {
    var host = server.address().address;
    console.log('[PARSER] listening at http://%s:%s', host, port);
});
app.get('/', function(req, res, next) {
    var fileName = req.query.fileName;
    var url = req.query.url;
    var inStream;
    var bz;
    var outStream = res;
    var d = domain.create();
    var parser;
    d.run(function() {
        if (!fileName && !url) {
            return outStream.json({
                capacity: capacity
            });
        }
        parser = spawn("java", ["-jar",
        "-Xmx64m",
        "parser/target/stats-0.1.0.jar"
    ], {
            //we want want to ignore stderr if we're not dumping it to /dev/null from java already
            stdio: ['pipe', 'pipe', 'ignore'],
            encoding: 'utf8'
        });
        bz = spawn("bunzip2", {
            stdio: ['pipe', 'pipe', 'ignore']
        });
        if (fileName) {
            inStream = fs.createReadStream(fileName);
            inStream.pipe(parser.stdin);
        }
        else if (url) {
            inStream = progress(request.get({
                url: url,
                encoding: null,
                timeout: 30000
            })).on('progress', function(state) {
                outStream.write(JSON.stringify({
                    "type": "progress",
                    "key": state.percent
                }));
            }).on('response', function(response) {
                if (response.statusCode !== 200) {
                    outStream.write(JSON.stringify({
                        "type": "error",
                        "key": response.statusCode
                    }));
                }
            });
            inStream.pipe(bz.stdin);
            bz.stdout.pipe(parser.stdin);
        }
        parser.stdout.pipe(outStream);
        /*
        parser.stderr.on('data', function(data) {
            console.log(data.toString());
            parser.stderr.resume();
        });
        */
    });
    d.on('error', function(err) {
        parser.kill();
        bz.kill();
        outStream.end(JSON.stringify({
            "type": "error",
            "key": err
        }));
    });
});
app.use(function(err, req, res, next) {
    return res.status(500).json({
        error: err
    });
});