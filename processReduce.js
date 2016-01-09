//Group events in buffer
module.exports = function processReduce(entries)
{
    var reduceMap = {};
    //group by player_slot, type, targethero, targetillusion
    for (var i = 0; i < entries.length; i++)
    {
        //group big categories: actions, combat log damage
        var e = entries[i];
        var identifier = [e.player_slot, e.type, e.key].join(":");
        e.value = e.value || 1;
        //var identifier = e.type;
        //e.value = 1;
        reduceMap[identifier] = reduceMap[identifier] ? reduceMap[identifier] + e.value : e.value || 1;
    }
    //var fs = require('fs');
    //fs.writeFileSync('./output3.json', JSON.stringify(reduceMap, null , 2));
};