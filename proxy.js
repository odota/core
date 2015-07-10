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
var httpProxy = require('http-proxy');
var proxy = httpProxy.createProxyServer({
    target: 'http://api.steampowered.com'
}).listen(process.env.PORT);
proxy.on('error', function (err, req, res) {
  console.log(err);
  process.exit(1);
});