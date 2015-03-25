var express = require('express');
var matches = express.Router();
var queries = require('../queries');
var matchPages = {
    index: {
        name: "Basic"
    },
    details: {
        name: "Details"
    },
    timelines: {
        name: "Timelines"
    },
    graphs: {
        name: "Graphs"
    },
    positions: {
        name: "Positions"
    },
    chat: {
        name: "Chat"
    }
};
matches.get('/', function(req, res) {
    res.render('matches.jade', {
        title: "Matches - YASP"
    });
});
matches.get('/:match_id/:info?', function(req, res, next) {
    console.time("match page");
    queries.prepareMatch(req.params.match_id, function(err, match) {
        if (err) {
            return next(err);
        }
        console.timeEnd("match page");
        var info = matchPages[req.params.info] ? req.params.info : "index";
        if (req.query.json) {
            //return res.json(match);
        }
        res.render("match_" + info, {
            route: info,
            match: match,
            tabs: matchPages,
            title: "Match " + match.match_id + " - YASP"
        });
    });
});
module.exports = matches;
