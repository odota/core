/**
 * Compute data requiring all players in a match for storage in match table
 **/
const utility = require('../util/utility');

function processAllPlayers(entries)
{
  const goldAdvTime = {};
  const xpAdvTime = {};
  const res = {
    radiant_gold_adv: [],
    radiant_xp_adv: [],
  };
  for (let i = 0; i < entries.length; i++)
    {
    const e = entries[i];
    if (e.type === 'interval' && e.time % 60 === 0)
        {
      const g = utility.isRadiant(e) ? e.gold : -e.gold;
      const x = utility.isRadiant(e) ? e.xp : -e.xp;
      goldAdvTime[e.time] = goldAdvTime[e.time] ? goldAdvTime[e.time] + g : g;
      xpAdvTime[e.time] = xpAdvTime[e.time] ? xpAdvTime[e.time] + x : x;
    }
  }
  const order = Object.keys(goldAdvTime).sort((a, b) => {
    return Number(a) - Number(b);
  });
  order.forEach((k) => {
    res.radiant_gold_adv.push(goldAdvTime[k]);
    res.radiant_xp_adv.push(xpAdvTime[k]);
  });
  return res;
}
module.exports = processAllPlayers;
