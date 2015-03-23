var express = require('express');
var api = express.Router();
var constants = require('../constants');
var db = require('../db');
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
    //var sort = makeSort(req.query.order, req.query.columns);
    var sort = {
        "match_id": -1
    };
    var project = req.query.project || {};
    if (select["players.account_id"]) {
        //convert the passed account id to number
        select["players.account_id"] = Number(select["players.account_id"]);
    }
    advQuery(select, {
        limit: limit,
        skip: start,
        sort: sort,
        fields: project
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
function advQuery(select, options, cb) {
    //currently api is using this
    //matches page, want matches fitting criteria
    //player matches page, want winrate, matches fitting criteria
    //player trends page, want agregation on matches fitting criteria
    //custom query wants some fields back, and some criteria, with aggregation on those fields
    //client options should include:
    //filter: specific player/specific hero id
    //filter: specific player was also in the game (use players.account_id with $and, but which player gets returned by projection?)
    //filter: specific hero was played by me, was on my team, was against me, was in the game
    //filter: specific game modes
    //filter: specific patches
    //filter: specific regions
    //filter: detect no stats recorded (algorithmically)
    //filter: significant game modes only    
    //client calls api, which processes a maximum number of matches (currently 10, parsed matches are really big and we dont want to spend massive bandwidth!)
    //can we increase the limit depending on the options passed?  if a user requests just a field or two we can return more
    //use advquery function as a wrapper around db.matches.find to do processing that mongo can't
    //select, a mongodb search hash
    //options, a mongodb/monk options hash
    //CONSTRAINT: each match can only have a SINGLE player matching the condition in order to make winrate/aggregations meaningful!
    //check select.keys to see if user requested special conditions
    //check options.fields.keys to see if user requested special fields, aggregate the selected fields
    //we need to pass aggregator specific fields since not all fields may exist (since we projected)
    //we can do indexes on the parsed data to enable mongo lookup, or post-process it in js
    //fields (projection), limit, skip, sort (but sorts are probably best done in js)
    //if selecting by account_id or hero_id, we project only that user in players array
    //if (select["players.account_id"] || select["players.hero_id"]){options.fields["players.$"] = 1;}
    db.matches.find(select, options, function(err, matches) {
        if (err) {
            return cb(err);
        }
        //filter and send through aggregator?
        var results = {
            aggData: null,
            data: matches
        };
        cb(err, results);
    });
}
module.exports = api;