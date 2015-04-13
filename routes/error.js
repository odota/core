var express = require('express');
var app = express.Router();
var config = require('../config');
app.use(function(req, res, next) {
    var err = new Error("Not Found");
    err.status = 404;
    return next(err);
});
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    console.log(err);
    if (config.NODE_ENV !== "development") {
        return res.render(err.status === 404 ? '404' : '500', {
            error: err
        });
    }
    //default express handler
    next(err);
});
module.exports = app;