/**
 * A processor to reduce the event stream by grouping similar events.
 * NOT CURRENTLY IN PRODUCTION USE
 **/
function processReduce(entries, match, meta)
{
    var result = entries.filter(function(e)
    {
        if (e.type === "actions")
        {
            return false;
        }
        if (e.type === "interval" && e.time % 60 !== 0)
        {
            return false;
        }
        if (!e.time)
        {
            return false;
        }
        return true;
    }).map(function(e)
    {
        var e2 = Object.assign(
        {}, e,
        {
            match_id: match.match_id,
            attackername_slot: meta.hero_to_slot[e.attackername],
            targetname_slot: meta.hero_to_slot[e.targetname],
            sourcename_slot: meta.hero_to_slot[e.sourcename],
            targetsourcename_slot: meta.hero_to_slot[e.targetname],
            player1_slot: meta.slot_to_playerslot[e.player1],
            player_slot: e.player_slot || meta.slot_to_playerslot[e.slot],
            inflictor: translate(e.inflictor),
        });
        delete e2.attackername;
        delete e2.targetname;
        delete e2.sourcename;
        delete e2.targetsourcename;
        return e2;
    });
    var count = {};
    result.forEach(function(r)
    {
        count[r.type] = (count[r.type] || 0) + 1;
    });
    console.log(count);
    return result;
}

function translate(s)
{
    return s === "dota_unknown" ? null : s;
}
module.exports = processReduce;