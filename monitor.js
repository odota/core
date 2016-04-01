var redis = require('./redis');
var db = require('./db');
var config = require('./config');
var request = require('request');
var utility = require('./utility');
var api_key = config.STEAM_API_KEY.split(',')[0];
var health = {
    random_match: function random_match(cb)
    {
        db.raw(`select max(match_id) from matches`).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            var max = Number(result.rows[0].max);
            var random = Math.floor(Math.random() * max);
            db.raw(`select match_id from matches where match_id > ? order by match_id asc limit 1`, [random]).asCallback(function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                request(config.ROOT_URL + "/matches/" + result.rows[0].match_id, function(err, resp, body)
                {
                    var fail = err || resp.statusCode !== 200;
                    return cb(fail,
                    {
                        metric: Number(fail),
                        threshold: 1,
                    });
                });
            });
        });
    },
    random_player: function random_player(cb)
    {
        db.raw(`select max(account_id) from players`).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            var max = Number(result.rows[0].max);
            var random = Math.floor(Math.random() * max);
            db.raw(`select account_id from players where account_id > ? order by account_id asc limit 1`, [random]).asCallback(function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                request(config.ROOT_URL + "/players/" + result.rows[0].account_id, function(err, resp, body)
                {
                    var fail = err || resp.statusCode !== 200;
                    return cb(fail,
                    {
                        metric: Number(fail),
                        threshold: 1,
                    });
                });
            });
        });
    },
    steam_api: function steam_api(cb)
    {
        request("http://api.steampowered.com" + "/IDOTA2Match_570/GetMatchHistory/V001/?key=" + api_key, function(err, resp, body)
        {
            if (err || resp.statusCode !== 200)
            {
                return cb("bad http response");
            }
            try
            {
                var fail = err || resp.statusCode !== 200 || JSON.parse(body).result.status !== 1;
                return cb(fail,
                {
                    metric: Number(fail),
                    threshold: 1,
                });
            }
            catch (e)
            {
                return cb('malformed http response');
            }
        });
    },
    seq_num_delay: function seq_num_delay(cb)
    {
        request("http://api.steampowered.com" + "/IDOTA2Match_570/GetMatchHistory/V001/?key=" + api_key, function(err, resp, body)
        {
            if (err || resp.statusCode !== 200)
            {
                return cb("bad http response");
            }
            try
            {
                //get match_seq_num, compare with real seqnum
                var curr_seq_num = JSON.parse(body).result.matches[0].match_seq_num;
                redis.get('match_seq_num', function(err, num)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    num = Number(num);
                    var metric = curr_seq_num - num;
                    return cb(err,
                    {
                        metric: metric,
                        threshold: 10000,
                    });
                });
            }
            catch (e)
            {
                return cb('malformed http response');
            }
        });
    },
    parse_delay: function parse_delay(cb)
    {
        //get parse delay array, compare with threshold (30 min)
        redis.lrange('parse_delay', 0, -1, function(err, arr)
        {
            if (err)
            {
                return cb(err);
            }
            var metric = utility.average(arr);
            return cb(err,
            {
                metric: metric,
                threshold: 30 * 60 * 1000,
            });
        });
    },
    redis_usage: function redis_usage(cb)
    {
        redis.info(function(err, info)
        {
            if (err)
            {
                return cb(err);
            }
            return cb(err,
            {
                metric: redis.server_info.used_memory,
                threshold: 16000000000
            });
        });
    },
    postgres_usage: function postgres_usage(cb)
    {
        db.raw(`select pg_database_size('yasp')`).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            return cb(err,
            {
                metric: result.rows[0].pg_database_size,
                threshold: 3750000000000
            });
        });
    }
};
for (var key in health)
{
    invokeInterval(health[key]);
}

function invokeInterval(func)
{
    //invokes the function immediately, waits for callback, waits the delay, and then calls it again
    (function invoker()
    {
        console.log("running %s", func.name);
        console.time(func.name);
        func(function(err, result)
        {
            if (err)
            {
                console.error(err);
                result = {
                    metric: 1,
                    threshold: 0,
                };
            }
            result.timestamp = ~~(new Date() / 1000);
            redis.hset('health', func.name, JSON.stringify(result));
            console.timeEnd(func.name);
            setTimeout(invoker, result && result.delay ? result.delay : 10000);
        });
    })();
}