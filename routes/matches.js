var constants = require('dotaconstants');
var buildMatch = require('../store/buildMatch');
var express = require('express');
var matches = express.Router();
var matchPages = {
    "index":
    {
        "name": "Overview"
    },
    "benchmarks":
    {
        "name": "Benchmarks"
    },
    "performances":
    {
        "name": "Performances",
        "parsed": true
    },
    "damage":
    {
        "name": "Damage",
        "parsed": true
    },
    "purchases":
    {
        "name": "Purchases",
        "parsed": true
    },
    "farm":
    {
        "name": "Farm",
        "parsed": true
    },
    "combat":
    {
        "name": "Combat",
        "parsed": true
    },
    "graphs":
    {
        "name": "Graphs",
        "parsed": true
    },
    "vision":
    {
        "name": "Vision",
        "parsed": true
    },
    "objectives":
    {
        "name": "Objectives",
        "parsed": true
    },
    "teamfights":
    {
        "name": "Teamfights",
        "parsed": true
    },
    "actions":
    {
        "name": "Actions",
        "parsed": true
    },
    "analysis":
    {
        "name": "Analysis",
        "parsed": true
    },
    "cosmetics":
    {
        "name": "Cosmetics",
        "parsed": true
    },
    "chat":
    {
        "name": "Chat",
        "parsed": true
    }
};
var compute = require('../util/compute');
var renderMatch = compute.renderMatch;
module.exports = function (db, redis, cassandra)
{
    matches.get('/:match_id/:info?', function (req, res, cb)
    {
        console.time("match page");
        buildMatch(req.params.match_id,
        {
            db: db,
            redis: redis,
            cassandra: cassandra,
        }, function (err, match)
        {
            if (err)
            {
                return cb(err);
            }
            if (!match)
            {
                return cb();
            }
            console.timeEnd("match page");
            var info = matchPages[req.params.info] ? req.params.info : "index";
            renderMatch(match);
            res.render("match/match_" + info,
            {
                route: info,
                match: match,
                tabs: matchPages,
                title: "Match " + match.match_id
            });
        });
    });
    return matches;
};
