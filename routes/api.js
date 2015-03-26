var express = require('express');
var api = express.Router();
var constants = require('../constants');
var advQuery = require('../advquery');
api.get('/items', function(req, res) {
    res.json(constants.items[req.query.name]);
});
api.get('/abilities', function(req, res) {
    res.json(constants.abilities[req.query.name]);
});
api.get('/matches', function(req, res, next) {
    var draw = Number(req.query.draw);
    var select = req.query.select || {};
    for (var key in select) {
        //querystring contains string values, convert them all to number
        select[key] = Number(select[key]);
    }
    //don't allow additional projection fields to be defined from api, enforce default in advquery
    var project = null;
    var start = Number(req.query.start);
    //todo possible to crash the server by attempting an invalid aggregation?  for now, don't allow aggregation
    var agg = {};
    //var agg = req.query.agg || {}; //by default, don't do aggregation on api requests
    var filter = req.query.filter || {};
    var length = Number(req.query.length);
    //limit/skip mess up aggregation if used, but are more efficient (less processing in JS)
    //db sorting on unindexed fields is slow, advQuery uses JS to sort the output by match_id
    //if using limit/skip though, can't rely on that sort though since advquery only gets one page of matches
    //so need to do a sort in mongo
    var limit = {};
    var skip = {};
    var sort = {};
    //var limit = Number(req.query.length);
    //var skip = Number(req.query.start);
    /*
    var sort = {
        "match_id": -1
    };
    */
    //var sort = makeSort(req.query.order, req.query.columns);
    advQuery({
        select: select,
        project: project,
        filter: filter,
        agg: agg,
        limit: limit,
        skip: skip,
        sort: sort,
        length: length,
        start: start
    }, function(err, result) {
        if (err) {
            return next(err);
        }
        res.json({
            draw: draw,
            recordsTotal: result.unfiltered.length,
            recordsFiltered: result.data.length,
            data: result.page
        });
    });
});
/*
function makeSort(order, columns) {
//Makes sort from a datatables call
    var sort = {
        match_id: -1
    };
    if (order && columns) {
        sort = {};
        order.forEach(function(s) {
            var c = columns[Number(s.column)];
            if (c) {
                sort[c.data] = s.dir === 'desc' ? -1 : 1;
            }
        });
    }
    return sort;
}
*/
module.exports = api;