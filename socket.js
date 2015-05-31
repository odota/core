var request = require('request');
var config = require('./config');
var rc_secret = config.RECAPTCHA_SECRET_KEY;
var queueReq = require('./operations').queueReq;
var r = require('./redis');
var redis = r.client;

module.exports = function(server){
    var io = require('socket.io')(server);
/*
setInterval(function() {
    status(function(err, res) {
        if (!err) io.emit(res);
    });
}, 5000);
*/
io.sockets.on('connection', function(socket) {
    socket.on('request', function(data) {
        console.log(data);
        request.post("https://www.google.com/recaptcha/api/siteverify", {
            form: {
                secret: rc_secret,
                response: data.response
            }
        }, function(err, resp, body) {
            try {
                body = JSON.parse(body);
            }
            catch (err) {
                return socket.emit("err", err);
            }
            var match_id = data.match_id;
            match_id = Number(match_id);
            socket.emit('log', "Received request for " + match_id);
            if (!body.success && config.NODE_ENV !== "test"
                    // if the DISABLE_RECAPTCHA env var has been set, ignore a bad body.success
                    && !config.DISABLE_RECAPTCHA) {
                console.log('failed recaptcha');
                socket.emit("err", "Recaptcha Failed!");
            }
            else if (isNaN(match_id)) {
                console.log("invalid match id");
                socket.emit("err", "Invalid Match ID!");
            }
            else {
                queueReq("request", {
                    match_id: match_id,
                    request: true
                }, function(err, job) {
                    if (err) {
                        return socket.emit('err', err);
                    }
                    socket.emit('log', "Queued API request for " + match_id);
                    job.on('progress', function(prog) {
                        //TODO: kue now allows emitting additional data so we can capture api start, api finish, match expired, parse start, parse finish
                        socket.emit('prog', prog);
                    });
                    job.on('complete', function(result) {
                        console.log(result);
                        socket.emit('log', "Request Complete!");
                        redis.del("match:" + match_id, function(err, resp) {
                            if (err) console.log(err);
                            socket.emit('complete');
                        });
                    });
                    job.on('failed', function(result) {
                        console.log(result);
                        socket.emit('err', JSON.stringify(result.error));
                    });
                });
            }
        });
    });
});
}