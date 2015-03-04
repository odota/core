var express = require('express');
var matches = express.Router();
var queries = require('../queries');

var matchPages = {
    index: {
        name: "Match"
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
matches.param('match_id', function(req, res, next, match_id) {
    queries.prepareMatch(match_id, function(err, match) {
        if (err) {
            return next(err);
        }
        req.match = match;
        next();
    });
});
matches.get('/:match_id/:info?', function(req, res, next) {
    var match = req.match;
    var tabs = match.parsed_data ? matchPages : {
        index: matchPages.index
    };
    var info = tabs[req.params.info] ? req.params.info : "index";
    res.render("match_" + info, {
        route: info,
        match: match,
        tabs: tabs,
        title: "Match " + match.match_id + " - YASP"
    });
});

module.exports = matches;
