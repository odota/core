/**
 * A processor to reduce the event stream by grouping similar events.
 * NOT CURRENTLY IN PRODUCTION USE
 **/
function processReduce(entries)
{
    var reduceMap = {};
    //group by player_slot, type, targethero, targetillusion
    for (var i = 0; i < entries.length; i++)
    {
        var e = entries[i];
        reduceMap[e.type] = reduceMap[e.type] ? reduceMap[e.type] + 1 : 1;
    }
    console.log(reduceMap);
    return entries.filter(function(e)
    {
        if (e.type === "actions")
        {
            return false;
        }
        if (e.type === "interval" && e.time % 60 !== 0)
        {
            return false;
        }
        return true;
    });
}
module.exports = processReduce;