var config = require('./config');
var express = require('express');
var request = require('request');
var cp = require('child_process');
var utility = require('./utility');
var exec = cp.exec;
var bodyParser = require('body-parser');
var app = express();
var capacity = require('os').cpus().length;
var runParse = require('./runParse');
var startedAt = new Date();
var port = config.PORT || config.PARSER_PORT;
var os = require('os');
var server = app.listen(port, function()
{
    var host = server.address().address;
    console.log('[PARSECLIENT] listening at http://%s:%s', host, port);
});
var version = utility.getParseSchema().version;
app.use(bodyParser.json());
app.get('/', function(req, res)
{
    res.json(
    {
        capacity: capacity,
        version: version,
        started_at: startedAt
    });
});
app.post('/deploy', function(req, res)
{
    var err = false;
    //TODO verify the POST is from github/secret holder
    if (req.body.ref === "refs/heads/master")
    {
        console.log(req.body);
        //run the deployment command
        var child = exec('npm run deploy-parser', function(error, stdout, stderr)
        {
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if (error)
            {
                console.log('exec error: ' + error);
            }
        });
        child.unref();
        console.log(child);
    }
    else
    {
        err = "not passing deploy conditions";
    }
    res.json(
    {
        error: err
    });
});
getJob();

function getJob()
{
    //get from endpoint asking for replay url
    var remote = config.WORK_URL + "/parse" + "?key=" + config.RETRIEVER_SECRET;
    console.log("contacting server for work: %s", remote);
    request(
    {
        url: remote,
        json: true,
        timeout: 30000
    }, function(err, resp, job)
    {
        if (!err && resp.statusCode === 200 && job && job.jobId && job.data && job.data.payload && job.data.payload.url)
        {
            console.log("got work from server, jobid: %s, url: %s", job.jobId, job.data.payload.url);
            runParse(job.data.payload, function(err, parsed_data)
            {
                if (err)
                {
                    console.error("error occurred on parse: %s", err);
                }
                parsed_data = parsed_data ||
                {};
                parsed_data.error = err;
                parsed_data.jobId = job.jobId;
                parsed_data.key = config.RETRIEVER_SECRET;
                parsed_data.version = version;
                parsed_data.hostname = os.hostname();
                console.log("sending work to server, jobid: %s", job.jobId);
                request(
                {
                    url: remote,
                    method: "POST",
                    json: parsed_data,
                    timeout: 30000
                }, function(err, resp, body)
                {
                    if (err || resp.statusCode !== 200 || body.error)
                    {
                        console.error("error occurred while submitting work: %s, status: %s", err || JSON.stringify(body), resp.statusCode);
                    }
                    if (parsed_data.error)
                    {
                        process.exit(1);
                    }
                    //get another job
                    return getJob();
                });
            });
        }
        else
        {
            //wait interval, then get another job
            console.log("error occurred while requesting work");
            return setTimeout(getJob, 5 * 1000);
        }
    });
}