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
    var js_agg = req.query.agg || {};
    //support sort hash, or order+columns
    var js_sort = req.query.js_sort || makeSort(req.query.order, req.query.columns) || {};
    var js_limit = Number(req.query.length);
    var js_skip = Number(req.query.start);
    advQuery({
        select: select,
        js_agg: js_agg,
        js_limit: js_limit,
        js_skip: js_skip,
        js_sort: js_sort,
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

function makeSort(order, columns) {
    //Makes sort from a datatables call
    var sort;
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
module.exports = api;