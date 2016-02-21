var queue = require('./queue');
var cQueue = queue.getQueue('cache');
var playerCache = require('./playerCache');
var updateCache = playerCache.updateCache;
var utility = require('./utility');
var redis = require('./redis');
var moment = require('moment');
cQueue.process(1, processCache);
cQueue.on('completed', function(job)
{
    job.remove();
});

function processCache(job, cb)
{
    var match = job.data.payload;
    console.log('match: %s', match.match_id);
    if (match.origin === "scanner")
    {
        incrCounts(match);
    }
    updateCache(match, function(err)
    {
        if (err)
        {
            console.error(err);
        }
        return cb(err);
    });
}

function incrCounts(match)
{
    //increment redis counts
    //count match
    redis.zadd("added_match", moment().format('X'), match.match_id);
    //picks
    var radiant = [];
    var dire = [];
    for (var i = 0; i < match.players.length; i++)
    {
        var p = match.players[i];
        if (p.hero_id === 0)
        {
            //exclude this match
            return;
        }
        if (utility.isRadiant(p))
        {
            radiant.push(p.hero_id);
        }
        else
        {
            dire.push(p.hero_id);
        }
    }
    //compute singles, dyads, triads, etc.
    for (var i = 1; i < 6; i++)
    {
        addToResults(k_combinations(radiant, i), i, match.radiant_win, match);
        addToResults(k_combinations(dire, i), i, !match.radiant_win, match);
    }

    function addToResults(groups, i, win, m)
    {
        groups.forEach(function(g)
        {
            //sort and join the g into a unique key
            g = g.sort(function(a, b)
            {
                return a - b;
            }).join(',');
            redis.zadd('picks:' + i + ":" + g, moment().format('X'), match.match_id);
            if (win)
            {
                redis.zadd('picks_wins:' + i + ":" + g, moment().format('X'), match.match_id);
            }
        });
    }
}

function k_combinations(arr, k)
{
    var i, j, combs, head, tailcombs;
    if (k > arr.length || k <= 0)
    {
        return [];
    }
    if (k === arr.length)
    {
        return [arr];
    }
    if (k == 1)
    {
        combs = [];
        for (i = 0; i < arr.length; i++)
        {
            combs.push([arr[i]]);
        }
        return combs;
    }
    // Assert {1 < k < arr.length}
    combs = [];
    for (i = 0; i < arr.length - k + 1; i++)
    {
        head = arr.slice(i, i + 1);
        //recursively get all combinations of the remaining array
        tailcombs = k_combinations(arr.slice(i + 1), k - 1);
        for (j = 0; j < tailcombs.length; j++)
        {
            combs.push(head.concat(tailcombs[j]));
        }
    }
    return combs;
}