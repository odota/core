var express = require('express');
var async = require('async');
var api = express.Router();
var constants = require('../constants');
var config = require('../config');
var request = require('request');
var rc_secret = config.RECAPTCHA_SECRET_KEY;
var multer = require('multer')(
{
    inMemory: true,
    fileSize: 100 * 1024 * 1024, // no larger than 100mb
});
const queue = require('../store/queue');
const rQueue = queue.getQueue('request');
const queries = require('../store/queries');
const buildMatch = require('../store/buildMatch');
const buildStatus = require('../store/buildStatus');
const playerCache = require('../store/playerCache');
const utility = require('../util/utility');
const crypto = require('crypto');
module.exports = function(db, redis, cassandra)
{
    api.use(function(req, res, cb)
    {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        cb();
    });
    api.get('/constants', function(req, res, cb)
    {
        res.header('Cache-Control', 'max-age=604800, public');
        res.json(constants);
    });
    api.get('/metadata', function(req, res, cb)
    {
        async.parallel(
        {
            banner: function(cb)
            {
                redis.get("banner", cb);
            },
            cheese: function(cb)
            {
                redis.get("cheese_goal", function(err, result)
                {
                    return cb(err,
                    {
                        cheese: result,
                        goal: config.GOAL
                    });
                });
            },
            user: function(cb)
            {
                cb(null, req.user);
            },
        }, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/items', function(req, res)
    {
        res.json(constants.items[req.query.name]);
    });
    api.get('/abilities', function(req, res)
    {
        res.json(constants.abilities[req.query.name]);
    });
    api.get('/matches/:match_id/:info?', function(req, res, cb)
    {
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
            res.json(match);
        });
    });
    //basic player data
    api.get('/players/:account_id', function(req, res, cb)
    {
        var account_id = Number(req.params.account_id);
        async.parallel(
        {
            profile: function(cb)
            {
                queries.getPlayer(db, account_id, cb);
            },
            solo_competitive_rank: function(cb)
            {
                redis.zscore('solo_competitive_rank', account_id, cb);
            },
            competitive_rank: function(cb)
            {
                redis.zscore('competitive_rank', account_id, cb);
            },
            mmr_estimate: function(cb)
            {
                queries.mmrEstimate(db, redis, account_id, cb);
            },
        }, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.use('/players/:account_id/:info?', function(req, res, cb)
    {
        if (Number.isNaN(req.params.account_id))
        {
            return cb("non-numeric account_id");
        }
        if (req.params.info !== "matches")
        {
            req.query.significant = [1];
        }
        var queryObj = {
            project: ['match_id'].concat(req.query.project || []),
            filter: req.query ||
            {},
        };
        var filterDeps = {
            win: ['player_slot', 'radiant_win'],
            patch: ['patch'],
            game_mode: ['game_mode'],
            lobby_type: ['lobby_type'],
            region: ['region'],
            date: ['start_time'],
            lane_role: ['lane_role'],
            hero_id: ['hero_id'],
            is_radiant: ['player_slot'],
            included_account_id: ['heroes'],
            excluded_account_id: ['heroes'],
            with_hero_id: ['player_slot', 'heroes'],
            against_hero_id: ['player_slot', 'heroes'],
            significant: ['duration', 'game_mode', 'lobby_type', 'radiant_win'],
        };
        for (var key in req.query)
        {
            //numberify and arrayify everything in query
            req.query[key] = [].concat(req.query[key]).map(function(e)
            {
                return isNaN(Number(e)) ? e : Number(e);
            });
            //tack onto req.query.project required projections due to filters
            queryObj.project = queryObj.project.concat(filterDeps[key] || []);
        }
        req.queryObj = queryObj;
        cb();
    });
    api.get('/players/:account_id/wordcloud', function(req, res, cb)
    {
        var result = {
            my_word_counts:
            {},
            all_word_counts:
            {},
        };
        req.queryObj.project = req.queryObj.project.concat(Object.keys(result));
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function(err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function(m)
            {
                for (var key in result)
                {
                    utility.mergeObjects(result[key], m[key]);
                }
            });
            res.json(result);
        });
    });
    api.get('/players/:account_id/wl', function(req, res, cb)
    {
        var result = {
            win: 0,
            lose: 0,
        };
        req.queryObj.project = req.queryObj.project.concat('player_slot', 'radiant_win');
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function(err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function(m)
            {
                if (utility.isRadiant(m) == m.radiant_win)
                {
                    result.win += 1;
                }
                else
                {
                    result.lose += 1;
                }
            });
            res.json(result);
        });
    });
    //TODO api.get('/players/:account_id/records', function(req, res, cb) {});
    //TODO api.get('/players/:account_id/wardmap', function(req, res, cb) {});
    //TODO api.get('/players/:account_id/heroes', function(req, res, cb) {});
    //TODO api.get('/players/:account_id/peers', function(req, res, cb) {});
    //TODO api.get('/players/:account_id/items', function(req, res, cb) {});
    //TODO api.get('/players/:account_id/activity', function(req, res, cb) {});
    //TODO api.get('/players/:account_id/histograms/:field', function(req, res, cb) {});
    //TODO api.get('/players/:account_id/trends/:field', function(req, res, cb) {});
    api.get('/players/:account_id/matches', function(req, res, cb)
    {
        console.log(req.queryObj);
        //TODO support limit/offset/sort
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function(err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            if (req.queryObj.project.indexOf('skill') !== -1)
            {
                queries.fillSkill(db, cache,
                {}, render);
            }
            else
            {
                render();
            }

            function render(err)
            {
                if (err)
                {
                    return cb(err);
                }
                return res.json(cache);
            }
        });
    });
    //non-match based
    api.get('/players/:account_id/ratings', function(req, res, cb)
    {
        queries.getPlayerRatings(db, req.params.account_id, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/players/:account_id/rankings', function(req, res, cb)
    {
        queries.getPlayerRankings(redis, req.params.account_id, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    /*
    api.get('/match_logs/:match_id', function(req, res, cb)
    {
        db.raw(`SELECT * FROM match_logs WHERE match_id = ? ORDER BY time ASC`, [req.params.match_id]).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result.rows);
        });
    });
    */
    api.get('/pro_matches', function(req, res, cb)
    {
        db.raw(`
        SELECT match_id, start_time, duration, ma.leagueid, name
        FROM matches ma
        JOIN leagues le
        ON ma.leagueid = le.leagueid
        WHERE ma.leagueid > 0
        ORDER BY match_id DESC
        `).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result.rows);
        });
    });
    api.get('/pro_players', function(req, res, cb)
    {
        queries.getProPlayers(db, redis, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/drafts', function(req, res, cb)
    {
        db.raw(`
        SELECT pb.hero_id,
        sum(case when ((pm.player_slot < 128) = m.radiant_win) then 1 else 0 end) wins, 
        sum(case when is_pick is true then 1 else 0 end) picks,
        sum(case when is_pick is false then 1 else 0 end) bans
        FROM picks_bans pb
        LEFT JOIN matches m
        ON pb.match_id = m.match_id
        LEFT JOIN player_matches pm
        ON pb.hero_id = pm.hero_id
        AND pm.match_id = m.match_id
        GROUP BY pb.hero_id;
        `).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result.rows);
        });
    });
    api.get('/pick_order', function(req, res, cb)
    {
        db.raw(`SELECT hero_id, ord, count( * ) FROM picks_bans WHERE is_pick is true GROUP BY hero_id, ord;`).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result.rows);
        });
    });
    api.get('/leagues', function(req, res, cb)
    {
        db.raw(`SELECT * FROM leagues ORDER BY leagueid DESC`).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result.rows);
        });
    });
    api.get('/distributions', function(req, res, cb)
    {
        queries.getDistributions(redis, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/rankings', function(req, res, cb)
    {
        queries.getHeroRankings(db, redis, req.query.hero_id,
        {}, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/benchmarks', function(req, res, cb)
    {
        queries.getBenchmarks(db, redis,
        {
            hero_id: req.query.hero_id
        }, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/status', function(req, res, cb)
    {
        buildStatus(db, redis, function(err, status)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(status);
        });
    });
    api.get('/search', function(req, res, cb)
    {
        if (!req.query.q)
        {
            return cb(400);
        }
        queries.searchPlayer(db, req.query.q, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
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
                var healthy = single.metric < single.threshold;
                res.status(healthy ? 200 : 500).json(single);
            }
        });
    });
    api.post('/request_job', multer.single("replay_blob"), function(req, res, next)
    {
        request.post("https://www.google.com/recaptcha/api/siteverify",
        {
            form:
            {
                secret: rc_secret,
                response: req.body.response
            }
        }, function(err, resp, body)
        {
            if (err)
            {
                return next(err);
            }
            try
            {
                body = JSON.parse(body);
            }
            catch (err)
            {
                return res.render(
                {
                    error: err
                });
            }
            var match_id = Number(req.body.match_id);
            var match;
            if (!body.success && config.ENABLE_RECAPTCHA && !req.file)
            {
                console.log('failed recaptcha');
                return res.json(
                {
                    error: "Recaptcha Failed!"
                });
            }
            else if (req.file)
            {
                console.log(req.file);
                //var key = req.file.originalname + Date.now();
                //var key = Math.random().toString(16).slice(2);
                const hash = crypto.createHash('md5');
                hash.update(req.file.buffer);
                var key = hash.digest('hex');
                redis.setex(new Buffer('upload_blob:' + key), 60 * 60, req.file.buffer);
                match = {
                    replay_blob_key: key
                };
            }
            else if (match_id && !Number.isNaN(match_id))
            {
                match = {
                    match_id: match_id
                };
            }
            if (match)
            {
                console.log(match);
                queue.addToQueue(rQueue, match,
                {
                    attempts: 1
                }, function(err, job)
                {
                    res.json(
                    {
                        error: err,
                        job:
                        {
                            jobId: job.jobId,
                            data: job.data
                        }
                    });
                });
            }
            else
            {
                res.json(
                {
                    error: "Invalid input."
                });
            }
        });
    });
    api.get('/request_job', function(req, res, cb)
    {
        rQueue.getJob(req.query.id).then(function(job)
        {
            if (job)
            {
                job.getState().then(function(state)
                {
                    return res.json(
                    {
                        jobId: job.jobId,
                        data: job.data,
                        state: state,
                        progress: job.progress()
                    });
                }).catch(cb);
            }
            else
            {
                res.json(
                {
                    state: "failed"
                });
            }
        }).catch(cb);
    });
    //TODO implement
    api.get('/picks/:n');
    //TODO @albertcui owns mmstats
    api.get('/mmstats');
    return api;
};
