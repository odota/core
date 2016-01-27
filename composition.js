var db = require('./db');
var JSONStream = require('JSONStream');
var utility = require('./utility');
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
//var end_id = Number(args[1]) || Number.MAX_VALUE;
module.exports = function(cb)
{
    var stream = db.select(['match_id', 'pgroup', 'radiant_win']).from('matches').where('match_id', '>=', start_id).where('game_mode', "!=", 11).orderBy("match_id", "desc").limit(100000).stream();
    stream.on('end', done);
    stream.pipe(JSONStream.parse());
    var result = {};
    var wins = {};
    var sorted = {};

    function done(err)
    {
        if (err)
        {
            console.error(err);
        }
        //console.log(result, wins);
        for (var key in result)
        {
            for (var key2 in result[key])
            {
                if (result[key][key2] > 5)
                {
                    var obj = {
                        key: key2,
                        games: result[key][key2],
                        wins: wins[key][key2]
                    };
                    if (!sorted[key])
                    {
                        sorted[key] = [];
                    }
                    sorted[key].push(obj);
                }
            }
        }
        for (var key in sorted)
        {
            sorted[key].sort(function(a, b)
            {
                return b.games - a.games;
            });
        }
        cb(err, sorted);
    }
    stream.on('data', function(m)
    {
        var radiant = [];
        var dire = [];
        //extract teams
        for (var key in m.pgroup)
        {
            //if any of the hero_ids are 0, exclude the match
            if (m.pgroup[key].hero_id === 0)
            {
                return;
            }
            if (utility.isRadiant(
                {
                    player_slot: key
                }))
            {
                radiant.push(m.pgroup[key].hero_id);
            }
            else
            {
                dire.push(m.pgroup[key].hero_id);
            }
        }
        //console.log(radiant, dire);
        //compute singles, dyads, triads, etc.
        for (var i = 1; i < 6; i++)
        {
            if (!result[i])
            {
                result[i] = {};
                wins[i] = {};
            }
            addToResults(k_combinations(radiant, i), i, m.radiant_win, m);
            addToResults(k_combinations(dire, i), i, !m.radiant_win, m);
        }
    });

    function addToResults(groups, i, win, m)
    {
        groups.forEach(function(g)
        {
            //sort and join the g into a unique key
            g = g.sort(function(a, b)
            {
                return a - b;
            }).join(',');
            result[i][g] = result[i][g] ? result[i][g] + 1 : 1;
            var score = Number(win);
            wins[i][g] = wins[i][g] ? wins[i][g] + score : score;
        });
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
};