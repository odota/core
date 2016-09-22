/**
 * A processor to reduce the event stream to only logs we want to persist
 **/
function processReduce(entries, match, meta)
{
    //for now, disable log parsing for regular matches
    if (!match.doLogParse)
    {
        return;
    }
    var basicLogTypes = {
        "obs": 1,
        "sen": 1,
        "obs_left": 1,
        "sen_left": 1,
    };
    var result = entries.filter(function (e)
    {
        if (!match.doLogParse)
        {
            return (e.type in basicLogTypes);
        }
        else
        {
            if (e.type === "actions")
            {
                return false;
            }
            if (e.type === "DOTA_COMBATLOG_MODIFIER_REMOVE")
            {
                return false;
            }
            if (e.type === "DOTA_COMBATLOG_XP" || e.type === "DOTA_COMBATLOG_GOLD")
            {
                return false;
            }
            /*
            if (e.type === "DOTA_COMBATLOG_ABILITY" || e.type === "DOTA_COMBATLOG_ITEM")
            {
                return false;
            }
            */
            if (e.type === "DOTA_COMBATLOG_DAMAGE")
            {
                return true;
            }
            if (e.type === "DOTA_COMBATLOG_MODIFIER_ADD" || e.type === "DOTA_COMBATLOG_HEAL")
            {
                return false;
                /*
                if (!e.targethero || e.targetillusion)
                {
                    return false;
                }
                */
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
        }
    }).map(function (e)
    {
        var e2 = Object.assign(
        {}, e,
        {
            match_id: match.match_id,
            attackername_slot: meta.slot_to_playerslot[meta.hero_to_slot[e.attackername]],
            targetname_slot: meta.slot_to_playerslot[meta.hero_to_slot[e.targetname]],
            sourcename_slot: meta.slot_to_playerslot[meta.hero_to_slot[e.sourcename]],
            targetsourcename_slot: meta.slot_to_playerslot[meta.hero_to_slot[e.targetname]],
            player1_slot: meta.slot_to_playerslot[meta.slot_to_playerslot[e.player1]],
            player_slot: e.player_slot || meta.slot_to_playerslot[e.slot],
            inflictor: translate(e.inflictor),
        });
        return e2;
    });
    /*
    var count = {};
    result.forEach(function(r)
    {
        count[r.type] = (count[r.type] || 0) + 1;
    });
    console.log(count);
    */
    return result;
}

function translate(s)
{
    return s === "dota_unknown" ? null : s;
}
module.exports = processReduce;
