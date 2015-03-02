var dotenv = require('dotenv');
dotenv.load();
var express = require('express');
var app = express();
app.get('/', function(req, res, next) {
    console.log(process.memoryUsage());
});
var server = app.listen(process.env.PARSER_PORT || process.env.PORT || 5200, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[PARSER] listening at http://%s:%s', host, port);
});