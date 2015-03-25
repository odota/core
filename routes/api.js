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
    //api limits the fields that will be returned per match
    //always project a player to prevent crash?  otherwise aggregators need to handle this case
    //todo right now this just always includes 1 player
    //this prevents crash on computematchdata, but costs extra bandwidth
    //add an option to disable aggregation?  Then we don't need to project a player
    var project = {
        start_time: 1,
        match_id: 1,
        cluster: 1,
        game_mode: 1,
        duration: 1,
        parse_status: 1,
        players: {
            $slice: 1
        },
        "players.account_id": 1
    };
    var start = Number(req.query.start);
    var limit = Number(req.query.length);
    //if limit is 0 or too big, reset it
    limit = (!limit || limit > 15000) ? 15000 : limit;
    //var sort = makeSort(req.query.order, req.query.columns);
    //api enforces sort by match_id
    var sort = {
        "match_id": -1
    };
    advQuery({
        select: select,
        project: project,
        filter: {},
        limit: limit,
        skip: start,
        sort: sort
    }, function(err, result) {
        if (err) {
            return next(err);
        }
        result.recordsTotal = 15000;
        result.recordsFiltered = result.data.length;
        result.draw = draw;
        res.json(result);
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