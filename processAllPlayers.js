var utility = require('./utility');
//Compute data requiring all players in a match for storage in match table
module.exports = function processAllPlayers(entries)
{
    var goldAdvTime = {};
    var xpAdvTime = {};
    var res = {
        radiant_gold_adv: [],
        radiant_xp_adv: []
    };
    for (var i = 0; i < entries.length; i++)
    {
        var e = entries[i];
        if (e.type === "interval" && e.time % 60 === 0)
        {
            var g = utility.isRadiant(e) ? e.gold : -e.gold;
            var x = utility.isRadiant(e) ? e.xp : -e.xp;
            goldAdvTime[e.time] = goldAdvTime[e.time] ? goldAdvTime[e.time] + g : g;
            xpAdvTime[e.time] = xpAdvTime[e.time] ? xpAdvTime[e.time] + x : x;
        }
    }
    var order = Object.keys(goldAdvTime).sort(function(a, b)
    {
        return Number(a) - Number(b);
    });
    order.forEach(function(k)
    {
        res.radiant_gold_adv.push(goldAdvTime[k]);
        res.radiant_xp_adv.push(xpAdvTime[k]);
    });
    return res;
};