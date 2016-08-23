var express = require('express');
var async = require('async');
var api = express.Router();
var constants = require('dotaconstants');
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
const queryRaw = require('../store/queryRaw');
var player_fields = constants.player_fields;
var subkeys = player_fields.subkeys;
var countCats = player_fields.countCats;
const utility = require('../util/utility');
const crypto = require('crypto');
const bodyParser = require('body-parser');
module.exports = function (db, redis, cassandra)
{
    api.use(function (req, res, cb)
    {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
        res.header('Access-Control-Allow-Credentials', 'true');
        cb();
    });
    api.get('/constants', function (req, res, cb)
    {
        res.header('Cache-Control', 'max-age=604800, public');
        res.json(constants);
    });
    api.get('/metadata', function (req, res, cb)
    {
        async.parallel(
        {
            banner: function (cb)
            {
                redis.get("banner", cb);
            },
            cheese: function (cb)
            {
                redis.get("cheese_goal", function (err, result)
                {
                    return cb(err,
                    {
                        cheese: result,
                        goal: config.GOAL
                    });
                });
            },
            user: function (cb)
            {
                cb(null, req.user);
            },
        }, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/items', function (req, res)
    {
        res.json(constants.items[req.query.name]);
    });
    api.get('/abilities', function (req, res)
    {
        res.json(constants.abilities[req.query.name]);
    });
    api.get('/matches/:match_id/:info?', function (req, res, cb)
    {
        buildMatch(
        {
            db: db,
            redis: redis,
            cassandra: cassandra,
            match_id: req.params.match_id
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
            res.json(match);
        });
    });
    //basic player data
    api.get('/players/:account_id', function (req, res, cb)
    {
        var account_id = Number(req.params.account_id);
        async.parallel(
        {
            profile: function (cb)
            {
                queries.getPlayer(db, account_id, cb);
            },
            tracked_until: function (cb)
            {
                redis.zscore('tracked', account_id, cb);
            },
            solo_competitive_rank: function (cb)
            {
                redis.zscore('solo_competitive_rank', account_id, cb);
            },
            competitive_rank: function (cb)
            {
                redis.zscore('competitive_rank', account_id, cb);
            },
            mmr_estimate: function (cb)
            {
                queries.getMmrEstimate(db, redis, account_id, cb);
            },
        }, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.use('/players/:account_id/:info?', function (req, res, cb)
    {
        if (Number.isNaN(req.params.account_id))
        {
            return cb("non-numeric account_id");
        }
        if (req.params.info !== "matches")
        {
            //we want to show insignificant matches in match view
            req.query.significant = [1];
        }
        var queryObj = {
            project: ['match_id'].concat(req.query.project || []).concat(req.query.sort || []),
            filter: req.query ||
            {},
            sort: req.query.sort,
            limit: Number(req.query.limit),
            offset: Number(req.query.offset),
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
            req.query[key] = [].concat(req.query[key]).map(function (e)
            {
                return isNaN(Number(e)) ? e : Number(e);
            });
            //tack onto req.query.project required projections due to filters
            queryObj.project = queryObj.project.concat(filterDeps[key] || []);
        }
        req.queryObj = queryObj;
        cb();
    });
    api.get('/players/:account_id/wordcloud', function (req, res, cb)
    {
        var result = {
            my_word_counts:
            {},
            all_word_counts:
            {},
        };
        req.queryObj.project = req.queryObj.project.concat(Object.keys(result));
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function (m)
            {
                for (var key in result)
                {
                    utility.mergeObjects(result[key], m[key]);
                }
            });
            res.json(result);
        });
    });
    api.get('/players/:account_id/wardmap', function (req, res, cb)
    {
        var result = {
            obs:
            {},
            sen:
            {},
        };
        req.queryObj.project = req.queryObj.project.concat(Object.keys(result));
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function (m)
            {
                for (var key in result)
                {
                    utility.mergeObjects(result[key], m[key]);
                }
            });
            //generally position data function is used to generate heatmap data for each player in a natch
            //we use it here to generate a single heatmap for aggregated counts
            var d = {
                "obs": true,
                "sen": true
            };
            utility.generatePositionData(d, result);
            res.json(d);
        });
    });
    api.get('/players/:account_id/wl', function (req, res, cb)
    {
        var result = {
            win: 0,
            lose: 0,
        };
        req.queryObj.project = req.queryObj.project.concat('player_slot', 'radiant_win');
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function (m)
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
    api.get('/players/:account_id/records', function (req, res, cb)
    {
        var result = {};
        req.queryObj.project = req.queryObj.project.concat(Object.keys(subkeys)).concat('hero_id', 'start_time');
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function (m)
            {
                for (var key in subkeys)
                {
                    if (!result[key] || m[key] > result[key][key])
                    {
                        result[key] = m;
                    }
                }
            });
            res.json(result);
        });
    });
    api.get('/players/:account_id/counts', function (req, res, cb)
    {
        var result = {};
        for (var key in countCats)
        {
            result[key] = {};
        }
        req.queryObj.project = req.queryObj.project.concat(Object.keys(countCats));
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function (m)
            {
                for (var key in countCats)
                {
                    if (!result[key][~~m[key]])
                    {
                        result[key][~~m[key]] = {
                            games: 0,
                            win: 0
                        };
                    }
                    result[key][~~m[key]].games += 1;
                    result[key][~~m[key]].win += Number(m.radiant_win === utility.isRadiant(m));
                }
            });
            res.json(result);
        });
    });
    api.get('/players/:account_id/heroes', function (req, res, cb)
    {
        var heroes = {};
        //prefill heroes with every hero
        for (var hero_id in constants.heroes)
        {
            var hero = {
                hero_id: hero_id,
                last_played: 0,
                games: 0,
                win: 0,
                with_games: 0,
                with_win: 0,
                against_games: 0,
                against_win: 0
            };
            heroes[hero_id] = hero;
        }
        req.queryObj.project = req.queryObj.project.concat('heroes', 'account_id', 'start_time', 'player_slot', 'radiant_win');
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function (m)
            {
                var isRadiant = utility.isRadiant;
                var player_win = isRadiant(m) === m.radiant_win;
                var group = m.heroes ||
                {};
                for (var key in group)
                {
                    var tm = group[key];
                    var tm_hero = tm.hero_id;
                    //don't count invalid heroes
                    if (tm_hero in heroes)
                    {
                        if (isRadiant(tm) === isRadiant(m))
                        {
                            if (tm.account_id === m.account_id)
                            {
                                //console.log("self %s", tm_hero, tm.account_id, m.account_id);
                                heroes[tm_hero].games += 1;
                                heroes[tm_hero].win += player_win ? 1 : 0;
                                if (m.start_time > heroes[tm_hero].last_played)
                                {
                                    heroes[tm_hero].last_played = m.start_time;
                                }
                            }
                            else
                            {
                                //console.log("teammate %s", tm_hero);
                                heroes[tm_hero].with_games += 1;
                                heroes[tm_hero].with_win += player_win ? 1 : 0;
                            }
                        }
                        else
                        {
                            //console.log("opp %s", tm_hero);
                            heroes[tm_hero].against_games += 1;
                            heroes[tm_hero].against_win += player_win ? 1 : 0;
                        }
                    }
                }
            });
            res.json(Object.keys(heroes).map(function (k)
            {
                return heroes[k];
            }).sort(function (a, b)
            {
                return b.games - a.games;
            }));
        });
    });
    api.get('/players/:account_id/peers', function (req, res, cb)
    {
        req.queryObj.project = req.queryObj.project.concat('heroes', 'start_time', 'player_slot', 'radiant_win');
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            var teammates = countPeers(cache);
            queries.getPeers(db, teammates,
            {
                account_id: req.params.account_id
            }, function (err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                res.json(result);
            });
        });
    });
    api.get('/players/:account_id/pros', function (req, res, cb)
    {
        req.queryObj.project = req.queryObj.project.concat('heroes', 'start_time', 'player_slot', 'radiant_win');
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            var teammates = countPeers(cache);
            queries.getProPeers(db, teammates,
            {
                account_id: req.params.account_id
            }, function (err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                res.json(result);
            });
        });
    });

    function countPeers(matches)
    {
        var teammates = {};
        var isRadiant = utility.isRadiant;
        matches.forEach(function (m)
        {
            var player_win = isRadiant(m) === m.radiant_win;
            var group = m.heroes ||
            {};
            for (var key in group)
            {
                var tm = group[key];
                //count teammate players
                if (!teammates[tm.account_id])
                {
                    teammates[tm.account_id] = {
                        account_id: tm.account_id,
                        last_played: 0,
                        win: 0,
                        games: 0,
                        with_win: 0,
                        with_games: 0,
                        against_win: 0,
                        against_games: 0
                    };
                }
                if (m.start_time > teammates[tm.account_id].last_played)
                {
                    teammates[tm.account_id].last_played = m.start_time;
                }
                //played with
                teammates[tm.account_id].games += 1;
                teammates[tm.account_id].win += player_win ? 1 : 0;
                if (isRadiant(tm) === isRadiant(m))
                {
                    //played with
                    teammates[tm.account_id].with_games += 1;
                    teammates[tm.account_id].with_win += player_win ? 1 : 0;
                }
                else
                {
                    //played against
                    teammates[tm.account_id].against_games += 1;
                    teammates[tm.account_id].against_win += player_win ? 1 : 0;
                }
            }
        });
        return teammates;
    }
    api.get('/players/:account_id/histograms/:field', function (req, res, cb)
    {
        var result = {};
        var field = req.params.field;
        req.queryObj.project = req.queryObj.project.concat('radiant_win', 'player_slot', req.params.field);
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            cache.forEach(function (m)
            {
                if (!result[~~m[field]])
                {
                    result[~~m[field]] = {
                        games: 0,
                        win: 0
                    };
                }
                result[~~m[field]].games += 1;
                result[~~m[field]].win += utility.isRadiant(m) === m.radiant_win ? 1 : 0;
            });
            res.json(result);
        });
    });
    api.get('/players/:account_id/matches', function (req, res, cb)
    {
        console.log(req.queryObj);
        req.queryObj.project = req.queryObj.project.concat('hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'game_mode', 'version', 'kills', 'deaths', 'assists');
        queries.getPlayerMatches(req.params.account_id, req.queryObj, function (err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            if (req.queryObj.project.indexOf('skill') !== -1)
            {
                queries.getMatchesSkill(db, cache,
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
    api.get('/players/:account_id/ratings', function (req, res, cb)
    {
        queries.getPlayerRatings(db, req.params.account_id, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/players/:account_id/rankings', function (req, res, cb)
    {
        queries.getPlayerRankings(redis, req.params.account_id, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.post('/explorer', bodyParser.json(
    {
        limit: '10kb'
    }), function (req, res, cb)
    {
        console.log(req.body);
        db('queries').insert(req.body).returning('*').asCallback(function (err, obj)
        {
            if (err)
            {
                return cb(err);
            }
            queryRaw(obj[0], function (err, result)
            {
                if (err)
                {
                    console.error(err);
                }
                res.json(result);
            });
        });
    });
    api.get('/explorer', function (req, res, cb)
    {
        if (req.query.id)
        {
            db.select().from('queries').where(
            {
                id: req.query.id
            }).asCallback(runQuery);
        }
        else
        {
            //TODO handle sql/nql queries
            res.json(
            {});
        }

        function runQuery(err, q)
        {
            if (err)
            {
                return cb(err);
            }
            console.log(q);
            queryRaw(q[0], function (err, result)
            {
                if (err)
                {
                    console.error(err);
                }
                res.json(result);
            });
        }
    });
    api.get('/leagues', function (req, res, cb)
    {
        db.raw(`SELECT * FROM leagues ORDER BY leagueid DESC`).asCallback(function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result.rows);
        });
    });
    api.get('/distributions', function (req, res, cb)
    {
        queries.getDistributions(redis, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/rankings', function (req, res, cb)
    {
        queries.getHeroRankings(db, redis, req.query.hero_id,
        {}, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/benchmarks', function (req, res, cb)
    {
        queries.getHeroBenchmarks(db, redis,
        {
            hero_id: req.query.hero_id
        }, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/status', function (req, res, cb)
    {
        buildStatus(db, redis, function (err, status)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(status);
        });
    });
    api.get('/search', function (req, res, cb)
    {
        if (!req.query.q)
        {
            return cb(400);
        }
        queries.searchPlayer(db, req.query.q, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(result);
        });
    });
    api.get('/health/:metric?', function (req, res, cb)
    {
        redis.hgetall('health', function (err, result)
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
    api.post('/request_job', multer.single("replay_blob"), function (req, res, next)
    {
        request.post("https://www.google.com/recaptcha/api/siteverify",
        {
            form:
            {
                secret: rc_secret,
                response: req.body.response
            }
        }, function (err, resp, body)
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
                }, function (err, job)
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
    api.get('/request_job', function (req, res, cb)
    {
        rQueue.getJob(req.query.id).then(function (job)
        {
            if (job)
            {
                job.getState().then(function (state)
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
    api.get('/matchups', function (req, res, cb)
    {
        //accept as input two arrays of up to 5
        var t0 = [].concat(req.query.t0 || []).slice(0, 5);
        var t1 = [].concat(req.query.t1 || []).slice(0, 5);
        //return wins of each team
        async.parallel(
        {
            t0: function (cb)
            {
                redis.hget('matchups', utility.matchupToString(t0, t1, true), cb);
            },
            t1: function (cb)
            {
                redis.hget('matchups', utility.matchupToString(t0, t1, false), cb);
            }
        }, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            res.json(
            {
                t0: Number(result.t0) || 0,
                t1: Number(result.t1) || 0,
            });
        });
    });
    //TODO @albertcui owns mmstats
    api.get('/mmstats');
    return api;
};