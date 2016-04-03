var express = require('express');
var async = require('async');
var api = express.Router();
var constants = require('../constants');
var buildMatch = require('../buildMatch');
var buildPlayer = require('../buildPlayer');
var queries = require('../queries');
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
    api.get('/navbar_pages', function(req, res)
    {
        res.json(constants.navbar_pages);
    });
    api.get('/matches/:match_id/:info?', function(req, res, cb)
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
    api.get('/user', function(req, res)
    {
        res.json(req.user);
    });
    api.get('/distributions');
    api.get('/picks/:n');
    api.get('/ratings/:account_id');
    api.get('/rankings/heroes/:hero_id');
    api.get('/rankings/players/:account_id');
    api.get('/faq');
    api.get('/status');
    //TODO will need to figure out how to do slugs if @albertcui insists on routing with them
    api.get('/blog/:n');
    //TODO @albertcui owns mmstats
    api.get('/mmstats');
    api.get('/banner');
    api.get('/cheese', function(req, res)
    {
        //TODO implement this
        res.json(
        {
            cheese: 1,
            goal: 2
        });
    });
    api.get('/search', function(req, res, cb)
    {
        queries.searchPlayer(db, req.query.q, function(err, result) {
            if (err)
            {
               return cb(err);
            }

            res.json(result)
        });
    });
    api.get('/health/:metric?', function(req, res, cb)
    {
        redis.hgetall('health', function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            for (var key in result)
            {
                result[key] = JSON.parse(result[key]);
            }
            if (!req.params.metric)
            {
                res.json(result);
            }
            else
            {
                var single = result[req.params.metric];
                res.status(single.metric < single.threshold ? 200 : 500).json(single);
            }
        });
    });
    return api;
};
