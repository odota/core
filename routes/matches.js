var constants = require('dotaconstants');
var buildMatch = require('../store/buildMatch');
var express = require('express');
var matches = express.Router();
var matchPages = constants.match_pages;
module.exports = function(db, redis, cassandra)
{
    matches.get('/:match_id/:info?', function(req, res, cb)
    {
        console.time("match page");
        buildMatch(
        {
            db: db,
            redis: redis,
            cassandra: cassandra,
            match_id: req.params.match_id
        }, function(err, match)
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
            res.render("match/match_" + info,
            {
                route: info,
                match: match,
                tabs: matchPages,
                title: "Match " + match.match_id + " - YASP"
            });
        });
    });
    return matches;
};
