/*
//general purpose proxy
var express = require('express');
var request = require('request');
var app = express();
app.use(function(req, res) {
    console.log(req.originalUrl);
    req.pipe(request(req.originalUrl)).pipe(res);
});
app.listen(process.env.PORT);
*/
//mirrors steam api
var config = require('./config');
var domain = require('domain');
var httpProxy = require('http-proxy');
var d = domain.create();
d.run(function() {
    httpProxy.createProxyServer({
        target: 'http://api.steampowered.com'
    }).listen(config.PROXY_PORT || config.PORT);
});
d.on('error', function(err) {
    console.log(err);
});