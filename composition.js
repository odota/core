var db = require('./db');
var JSONStream = require('JSONStream');
var utility = require('./utility');
var constants = require('./constants');
var numHeroes = Object.keys(constants.heroes).length;
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
//var end_id = Number(args[1]) || Number.MAX_VALUE;
module.exports = function(cb)
{
    var stream = db.select(['match_id', 'pgroup', 'radiant_win']).from('matches').where('match_id', '>=', start_id).where('game_mode', "!=", 11).orderBy("match_id", "desc").limit(50000).stream();
    stream.on('end', done);
    stream.pipe(JSONStream.parse());
    var result = {};
    var wins = {};
    var count = 0;
    var sorted = {};
    //do something with these?  invert?
    var sSpace = {
        1: binomial(numHeroes, 1) / binomial(5, 1) / 2,
        2: binomial(numHeroes, 2) / binomial(5, 2) / 2,
        3: binomial(numHeroes, 3) / binomial(5, 3) / 2,
        4: binomial(numHeroes, 4) / binomial(5, 4) / 2,
        5: binomial(numHeroes, 5) / binomial(5, 5) / 2,
    };
    var sSpace = {
        1: 0.001,
        2: 0.0039,
        3: 0.0015,
        4: 0.00015,
        5: 0.00002
    };
    //console.log(sSpace);
    function binomial(n, k)
    {
        if ((typeof n !== 'number') || (typeof k !== 'number')) return false;
        var coeff = 1;
        for (var x = n - k + 1; x <= n; x++) coeff *= x;
        for (x = 1; x <= k; x++) coeff /= x;
        return coeff;
    }

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
                if (result[key][key2] > sSpace[key] * count)
                {
                    var obj = {
                        key: key2,
                        games: result[key][key2],
                        wins: wins[key][key2],
                        total: count
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
            console.log(key, sorted[key].length);
        }
        cb(err, sorted);
    }
    stream.on('data', function(m)
    {
        count += 1;
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
