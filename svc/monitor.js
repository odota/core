/**
 * Worker that monitors health metrics and saves results
 **/
var config = require('../config');
var redis = require('../store/redis');
var db = require('../store/db');
var cassandra = require('../store/cassandra');
var utility = require('../util/utility');
var request = require('request');
var api_key = config.STEAM_API_KEY.split(',')[0];
var health = {
    random_player: function random_player(cb)
    {
        db.raw(`select account_id from players tablesample system(1) limit 1`).asCallback(function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            if (!result.rows[0])
            {
                return cb();
            }
            request(config.ROOT_URL + "/api/players/" + result.rows[0].account_id, function (err, resp, body)
            {
                var fail = err || resp.statusCode !== 200;
                return cb(fail,
                {
                    metric: Number(fail),
                    threshold: 1,
                });
            });
        });
    },
    steam_api: function steam_api(cb)
    {
        request("http://api.steampowered.com" + "/IDOTA2Match_570/GetMatchHistory/V001/?key=" + api_key, function (err, resp, body)
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
        utility.getData(utility.generateJob("api_history",
        {}).url, function (err, body)
        {
            if (err)
            {
                return cb("failed to get current sequence number");
            }
            //get match_seq_num, compare with real seqnum
            var curr_seq_num = body.result.matches[0].match_seq_num;
            redis.get('match_seq_num', function (err, num)
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
        });
    },
    redis_usage: function redis_usage(cb)
    {
        redis.info(function (err, info)
        {
            if (err)
            {
                return cb(err);
            }
            return cb(err,
            {
                metric: redis.server_info.used_memory,
                threshold: 13 * Math.pow(10, 9),
            });
        });
    },
    postgres_usage: function postgres_usage(cb)
    {
        db.raw(`select pg_database_size('yasp')`).asCallback(function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            return cb(err,
            {
                metric: result.rows[0].pg_database_size,
                threshold: 2 * Math.pow(10, 11),
            });
        });
    },
    cassandra_usage: function cassandra_usage(cb)
    {
        cassandra.execute(`select mean_partition_size, partitions_count from system.size_estimates where keyspace_name = 'yasp'`, function (err, result)
        {
            if (err)
            {
                return cb(err);
            }
            var size = 0;
            result.rows.forEach(function (r)
            {
                size += r.mean_partition_size * r.partitions_count * 0.5 * 4;
            });
            return cb(err,
            {
                metric: size,
                threshold: 8 * Math.pow(10, 12),
            });
        });
    },
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
        func(function (err, result)
        {
            if (err)
            {
                console.error(err);
                result = {
                    metric: 1,
                    threshold: 0,
                };
            }
            if (result)
            {
                result.timestamp = ~~(new Date() / 1000);
                redis.hset('health', func.name, JSON.stringify(result));
            }
            console.timeEnd(func.name);
            setTimeout(invoker, result && result.delay ? result.delay : 10000);
        });
    })();
}
