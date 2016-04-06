var express = require('express');
var players = express.Router();
var constants = require('../constants.js');
var querystring = require('querystring');
var buildPlayer = require('../buildPlayer');
//list of fields that are numerical (continuous).  These define the possible categories for histograms, trends, and records
var player_fields = constants.player_fields;
var playerPages = constants.player_pages;
module.exports = function(db, redis)
{
    players.get('/:account_id/:info?/:subkey?', function(req, res, cb)
    {
        console.time("player " + req.params.account_id);
        var info = playerPages[req.params.info] ? req.params.info : "index";
        var subkey = req.params.subkey || "kills";
        buildPlayer(
        {
            db: db,
            redis: redis,
            account_id: req.params.account_id,
            info: info,
            subkey: subkey,
            query: req.query
        }, function(err, player)
        {
            if (err)
            {
                return cb(err);
            }
            delete req.query.account_id;
            console.timeEnd("player " + req.params.account_id);
            res.render("player/player_" + info,
            {
                q: req.query,
                querystring: Object.keys(req.query).length ? "?" + querystring.stringify(req.query) : "",
                player: player,
                route: info,
                subkey: subkey,
                tabs: playerPages,
                histograms: player_fields.subkeys,
                times: player_fields.times,
                counts: player_fields.countCats,
                title: (player.profile.personaname || player.profile.account_id) + " - YASP - Dota 2 Statistics"
            });
        });
    });
    //return router
    return players;
};
