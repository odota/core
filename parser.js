var dotenv = require('dotenv');
dotenv.load();
var express = require('express');
var constants = require('./constants.json');
var seaport = require('seaport');
var ports = seaport.connect(process.env.REGISTRY_HOST || 'localhost', Number(process.env.REGISTRY_PORT) || 5300);
var app = express();
app.get('/', function(req, res, next) {
    console.log(process.memoryUsage());
});
var port = process.env.PARSER_PORT || process.env.PORT || 5200;
var server = app.listen(port, function() {
    var host = server.address().address;
    console.log('[PARSER] listening at http://%s:%s', host, port);
    ports.register('parser@' + constants.parser_version + ".0.0", {
        host: host,
        port: port,
        url: process.env.PARSER_URL
    });
});
