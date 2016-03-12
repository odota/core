var express = require('express');
var api = express.Router();
var constants = require('../constants');
var buildMatch = require('../buildMatch');
var buildPlayer = require('../buildPlayer');
module.exports = function(db, redis)
{
    api.get('/items', function(req, res)
    {
        res.json(constants.items[req.query.name]);
    });
    api.get('/abilities', function(req, res)
    {
        res.json(constants.abilities[req.query.name]);
    });
    api.get('/match_pages', function(req, res)
    {
        res.json(constants.match_pages);
    });
    api.get('/player_pages', function(req, res)
    {
        res.json(constants.player_pages);
    });
    api.get('/navbar', function(req, res)
    {
        res.json(constants.navbar);
    });
    api.get('/matches/:match_id/:info', function(req, res, cb)
    {
        buildMatch(
        {
            db: db,
            redis: redis,
            match_id: req.params.match_id
        }, function(err, match)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(match);
        });
    });
    api.get('/players/:account_id/:info?/:subkey?', function(req, res, cb)
    {
        buildPlayer(
        {
            db: db,
            redis: redis,
            account_id: req.params.account_id,
            info: req.params.info,
            subkey: req.params.subkey,
            query: req.query
        }, function(err, player)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(player);
        });
    });
    api.get('/mmrestimate');
    api.get('/cheese status');
    api.get('/login_status');
    return api;
};
