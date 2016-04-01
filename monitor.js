var redis = require('./redis');
var db = require('./db');
var config = require('./config');
var request = require('request');
var utility = require('./utility');
var api_key = config.STEAM_API_KEY.split(',')[0];
var health = {
    random_match: function(cb)
    {
        db.raw(`select max(match_id) from matches`).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            var max = Number(result.rows[0].match_id);
            var random = Math.floor(Math.random() * max);
            db.raw(`select match_id from matches where match_id > ? order by match_id asc limit 1`, [random]).asCallback(function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                request(config.ROOT_URL + "/matches/" + result.rows[0], function(err, resp, body)
                {
                    return cb(err || resp.statusCode !== 200,
                    {
                        metadata: random,
                        ok: true
                    });
                });
            });
        });
    },
    random_player: function(cb)
    {
        db.raw(`select max(account_id) from players`).asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            var max = Number(result.rows[0].account_id);
            var random = Math.floor(Math.random() * max);
            db.raw(`select account_id from players where account_id > ? order by account_id asc limit 1`, [random]).asCallback(function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                request(config.ROOT_URL + "/players/" + result.rows[0], function(err, resp, body)
                {
                    return cb(err || resp.statusCode !== 200,
                    {
                        metadata: random,
                        ok: true
                    });
                });
            });
        });
    },
    steam_api: function(cb)
    {
        request("http://api.steampowered.com" + "/IDOTA2Match_570/GetMatchHistory/V001/?key=" + api_key, function(err, resp, body)
        {
            if (err || resp.statusCode !== 200)
            {
                return cb("bad http response");
            }
            try
            {
                return cb(err || resp.statusCode !== 200,
                {
                    metadata: "",
                    ok: JSON.parse(body).result.status === 1
                });
            }
            catch (e)
            {
                return cb('malformed http response');
            }
        });
    },
    seq_num_delay: function(cb)
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
                        metadata: metric,
                        ok: metric < 10000
                    });
                });
            }
            catch (e)
            {
                return cb('malformed http response');
            }
        });
    },
    parse_delay: function(cb)
    {
        //get parse delay array, compare with threshold (30 min)
        redis.lrange('parse_delay', 0, -1, function(err, arr)
        {
            if (err)
            {
                return cb(err);
            }
            var metric = utility.average(arr);
            console.log(metric);
            return cb(err,
            {
                metadata: metric,
                ok: metric < 30 * 60 * 1000
            });
        });
    },
};
for (var key in health)
{
    health[key](function(err, result)
    {
        if (err)
        {
            console.log(err);
        }
        else
        {
            result.timestamp = ~~(new Date() / 1000);
            redis.hset('health', key, JSON.stringify(result));
        }
        setTimeout(health[key], result && result.interval ? result.interval : 1000);
    });
}