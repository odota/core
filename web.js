//choose the web application to run
var app = process.env.RETRIEVER ? require('./retriever') : require('./yasp');
//fire up the application
var server = app.listen(process.env.PORT || 5000, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});
if (process.env.RETRIEVER) {
    setTimeout(function() {
        process.exit(0);
    }, 1000 * 60 * 60);
}
else {
    require('./backend');
    require('./parser');
}