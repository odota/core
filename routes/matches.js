var constants = require('dotaconstants');
var buildMatch = require('../store/buildMatch');
var express = require('express');
var matches = express.Router();
var matchPages = constants.match_pages;
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
