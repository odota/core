var app;
if (process.env.RETRIEVER) {
    app = require('./retriever').app;
}
else {
    app = require('./yasp').app;
}
