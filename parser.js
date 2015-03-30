var config = require('./config');
var express = require('express');
var request = require('request');
var fs = require('fs');
var spawn = require('child_process').spawn;
var progress = require('request-progress');
var app = express();
var capacity = require('os').cpus().length;
var port = config.PARSER_PORT;
var server = app.listen(port, function() {
    var host = server.address().address;
    console.log('[PARSER] listening at http://%s:%s', host, port);
    /*
    //server must support tcp!
    var constants = require('./constants.json');
    var seaport = require('seaport');
    var ports = seaport.connect(process.env.REGISTRY_HOST || 'localhost', Number(process.env.REGISTRY_PORT) || 5300);
    ports.register('retriever@' + constants.parser_version + '.0.0', {
        host: host,
        port: port,
        cores: numCPUs
    });
*/
});
app.get('/', function(req, res, next) {
    console.log(process.memoryUsage());
    var inStream;
    var bz;
    var parser = spawn("java", ["-jar",
        "-Xmx64m",
        "parser/target/stats-0.1.0.one-jar.jar"
    ], {
        //we want want to ignore stderr if we're not dumping it to /dev/null from clarity already
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8'
    });
    var fileName = req.query.fileName;
    var url = req.query.url;
    var outStream = res;
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
        bz = spawn("bunzip2");
        inStream.pipe(bz.stdin);
        bz.stdout.pipe(parser.stdin);
    }
    else {
        outStream.json({
            capacity: capacity
        });
    }
    parser.stderr.on('data', function(data) {
        console.log(data.toString());
    });
    /*
    //tries to write after stream end
    parser.on('exit', function(code) {
        outStream.write(JSON.stringify({
            "type": "exit",
            "key": code
        }));
    });
    */
    parser.stdout.pipe(outStream);
});
app.use(function(err, req, res, next) {
    return res.status(500).json({
        error: err
    });
});