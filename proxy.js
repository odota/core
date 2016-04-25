/**
 * Worker proxying requests to the Steam API.
 **/
//mirrors steam api
var config = require('./config');
var httpProxy = require('http-proxy');
httpProxy.createProxyServer({
    target: 'http://api.steampowered.com',
    changeOrigin: true
}).listen(config.PORT || config.OPENSHIFT_NODEJS_PORT || config.PROXY_PORT, config.OPENSHIFT_NODEJS_IP);
/*
//general purpose proxy
var express = require('express');
var request = require('request');
var app = express();
app.use(function(req, res) {
    console.log(req.originalUrl);
    req.pipe(request(req.originalUrl)).pipe(res);
});
app.listen(config.PORT);
*/