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
    //we add the player data if a player selection field present?
    //todo right now this just always includes all the players
    var project = {
        start_time: 1,
        match_id: 1,
        cluster: 1,
        game_mode: 1,
        duration: 1,
        parse_status: 1,
        players: 1
    };
    var start = Number(req.query.start);
    var limit = Number(req.query.length);
    //if limit is 0 or too big, reset it
    //api limits the number of results it will return
    //todo can we aggregate on large limit, but only return small limit?
    //current implementation limits before aggregation
    limit = (!limit || limit > 10) ? 1 : limit;
    //var sort = makeSort(req.query.order, req.query.columns);
    //api enforces sort by match_id
    var sort = {
        "match_id": -1
    };
    advQuery(select, {
        limit: limit,
        skip: start,
        sort: sort,
        fields: project,
        advQuery: {
            filter: {}
        }
    }, function(err, result) {
        if (err) {
            return next(err);
        }
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