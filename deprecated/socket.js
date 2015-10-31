var request = require('request');
var config = require('./config');
var rc_secret = config.RECAPTCHA_SECRET_KEY;
var queueReq = require('./operations').queueReq;
var redis = require('./redis');
var status = require('./status');
var socketio = require('socket.io');

module.exports = function(server) {
    var io = socketio(server);
    /*
    setInterval(function() {
        status(function(err, res) {
            if (!err) io.emit('status', res);
        });
    }, 3000);
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
                socket.emit('log', "Received request for match " + match_id);
                if (!body.success && config.NODE_ENV !== "test"
                    // if the DISABLE_RECAPTCHA env var has been set, ignore a bad body.success
                    && !config.DISABLE_RECAPTCHA) {
                    console.log('failed recaptcha');
                    socket.emit("err", "Recaptcha Failed!");
                }
                else if (!match_id) {
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
                        job.on('progress', function(prog, data) {
                            socket.emit('prog', prog);
                            if (data){
                                socket.emit('log', data);
                            }
                        });
                        job.on('complete', function(result) {
                            console.log(result);
                            socket.emit('log', "Request complete!");
                            //count in redis
                            redis.setex("requested_match:" + match_id, 60 * 60 * 24, "1");
                            //clear the cache for this match
                            redis.del("match:" + match_id, function(err, resp) {
                                if (err) console.log(err);
                                socket.emit('complete');
                            });
                        });
                        job.on('failed', function(result) {
                            console.log(JSON.stringify(result));
                            socket.emit('err', result);
                        });
                    });
                }
            });
        });
    });
}