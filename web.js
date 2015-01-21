var app;
if (process.env.RETRIEVER) {
    //retriever starts itself so that default npm start will start a retriever
    app = require('./retriever').app;
}
else {
    app = require('./yasp').app;
    var server = app.listen(process.env.PORT || 3000, function() {
        var host = server.address().address;
        var port = server.address().port;
        console.log('[WEB] listening at http://%s:%s', host, port);
    });
}
