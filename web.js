var app = process.env.RETRIEVER ? require('./retriever') : require('./yasp');
var backend = require('./backend');
var parser = require('./parser');
var server = app.listen(process.env.PORT || 3000, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});