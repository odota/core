var express = require('express');
var api = express.Router();
var utility = require('../utility');
var makeSort = utility.makeSort;
var constants = require('../constants');
var queries = require('../queries');
api.get('/items', function(req, res) {
    res.json(constants.items[req.query.name]);
});
api.get('/abilities', function(req, res) {
    res.json(constants.abilities[req.query.name]);
});
api.get('/matches', function(req, res, next) {
    var draw = Number(req.query.draw);
    var start = Number(req.query.start);
    var limit = Number(req.query.length);
    //if limit is 0 or too big, reset it
    //limit the number of results when using api to prevent abuse
    limit = (!limit || limit > 10) ? 1 : limit;
    var select = req.query.select || {};
    var sort = makeSort(req.query.order, req.query.columns);
    var project = req.query.project || {};
    if (select["players.account_id"]) {
        //convert the passed account id to number
        select["players.account_id"] = Number(select["players.account_id"]);
    }
    queries.advQuery(select, {
        limit: limit,
        skip: start,
        sort: sort,
        fields: project
    }, function(err, result) {
        if (err) {
            return next(err);
        }
        result.draw = draw;
        //properties: draw, summaries, data
        res.json(result);
    });
});
module.exports = api;