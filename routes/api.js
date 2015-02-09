var express = require('express');
var api = express.Router();
var utility = require('../utility');
var makeSort = utility.makeSort;
var db = require('../db');
var constants = require('../constants');
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
    limit = (!limit || limit > 100) ? 100 : limit;
    var select = req.query.select || {};
    var sort = makeSort(req.query.order, req.query.columns);
    var project = {
        start_time: 1,
        match_id: 1,
        cluster: 1,
        game_mode: 1,
        duration: 1,
        radiant_win: 1,
        parse_status: 1
    };
    for (var prop in req.query.select) {
        if (prop === "players.account_id") {
            req.query.select[prop] = Number(req.query.select[prop]);
            project["players.$"] = 1;
        }
    }
    db.matches.count(select, function(err, count) {
        if (err) {
            return next(err);
        }
        db.matches.find(select, {
            limit: limit,
            skip: start,
            sort: sort,
            fields: project
        }, function(err, docs) {
            if (err) {
                return next(err);
            }
            res.json({
                draw: draw,
                recordsTotal: count,
                recordsFiltered: count,
                data: docs
            });
        });
    });
});

module.exports = api;