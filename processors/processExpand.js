/**
 * Expands an event stream into multiple streams, with the necessary events types in each.
 * Returns an object containing each child stream as an array
 **/
function processExpand(entries, meta)
{
    var types = {
        "DOTA_COMBATLOG_DAMAGE": function(e)
        {
            //damage
            e.unit = e.sourcename; //source of damage (a hero)
            e.key = computeIllusionString(e.targetname, e.targetillusion);
            //count damage dealt to unit
            e.type = "damage";
            expand(e);
            //check if this damage happened to a real hero
            if (e.targethero && !e.targetillusion)
            {
                //reverse and count as damage taken (see comment for reversed kill)
                var r = {
                    time: e.time,
                    unit: e.key,
                    key: e.unit,
                    value: e.value,
                    type: "damage_taken"
                };
                expand(r);
                //count a hit on a real hero with this inflictor
                var h = {
                    time: e.time,
                    unit: e.unit,
                    key: translate(e.inflictor),
                    type: "hero_hits"
                };
                expand(h);
                //don't count self-damage for the following
                if (e.key !== e.unit)
                {
                    //count damage dealt to a real hero with this inflictor
                    var inf = {
                        type: "damage_inflictor",
                        time: e.time,
                        unit: e.unit,
                        key: translate(e.inflictor),
                        value: e.value
                    };
                    expand(inf);
                    //biggest hit on a hero
                    var m = {
                        type: "max_hero_hit",
                        time: e.time,
                        max: true,
                        inflictor: translate(e.inflictor),
                        unit: e.unit,
                        key: e.key,
                        value: e.value
                    };
                    expand(m);
                }
            }
            if (e.attackerhero && e.targethero && !e.targetillusion && e.key !== e.unit)
            {
                var inf_rec = {
                    type: "damage_inflictor_received",
                    time: e.time,
                    unit: e.key,
                    key: translate(e.inflictor),
                    value: e.value
                };
                expand(inf_rec);
            }
        },
        "DOTA_COMBATLOG_HEAL": function(e)
        {
            //healing
            e.unit = e.sourcename; //source of healing (a hero)
            e.key = computeIllusionString(e.targetname, e.targetillusion);
            e.type = "healing";
            expand(e);
        },
        "DOTA_COMBATLOG_MODIFIER_ADD": function(e)
        {
            //gain buff/debuff
            e.unit = e.attackername; //unit that buffed (can we use source to get the hero directly responsible? chen/enchantress/etc.)
            e.key = translate(e.inflictor); //the buff
            e.targetname = computeIllusionString(e.targetname, e.targetillusion); //target of buff (possibly illusion)
            if (e.targethero && !e.targetillusion)
            {
                var whitelist = {
                    "modifier_item_ultimate_scepter_consumed": 1
                };
                if (e.key in whitelist)
                {
                    e.type = "modifier_applied";
                    expand(e);
                }
            }
        },
        "DOTA_COMBATLOG_MODIFIER_REMOVE": function(e)
        {
            //lose buff/debuff
            //TODO: do something with modifier lost events, really only useful if we want to try to "time" modifiers
            //e.targetname is unit losing buff (possibly illusion)
            //e.inflictor is name of buff
            e.type = "modifier_lost";
        },
        "DOTA_COMBATLOG_DEATH": function(e)
        {
            //kill
            e.unit = e.sourcename; //killer (a hero)
            e.key = computeIllusionString(e.targetname, e.targetillusion);
            //don't count denies/expires
            if (e.attackername !== e.key)
            {
                //count kill by this unit
                e.type = "killed";
                expand(e);
            }
            //killed unit was a real hero
            if (e.targethero && !e.targetillusion)
            {
                //log this hero kill
                var e2 = JSON.parse(JSON.stringify(e));
                e2.type = "kills_log";
                expand(e2);
                //reverse and count as killed by
                //if the killed unit isn't a hero, we don't care about killed_by
                var r = {
                    time: e.time,
                    unit: e.key,
                    key: e.unit,
                    type: "killed_by"
                };
                expand(r);
            }
        },
        "DOTA_COMBATLOG_ABILITY": function(e)
        {
            //ability use
            e.unit = e.attackername;
            e.key = translate(e.inflictor);
            e.type = "ability_uses";
            expand(e);
        },
        "DOTA_COMBATLOG_ITEM": function(e)
        {
            //item use
            e.unit = e.attackername;
            e.key = translate(e.inflictor);
            e.type = "item_uses";
            expand(e);
        },
        "DOTA_COMBATLOG_LOCATION": function(e)
        {
            //not in replay?
            console.log(e);
        },
        "DOTA_COMBATLOG_GOLD": function(e)
        {
            //gold gain/loss
            e.unit = e.targetname;
            e.key = e.gold_reason;
            //gold_reason=8 is cheats, not added to constants
            e.type = "gold_reasons";
            expand(e);
        },
        "DOTA_COMBATLOG_GAME_STATE": function(e)
        {
            //state
            //we don't use this here--we already used it during preprocessing to detect game_zero
            e.type = "state";
        },
        "DOTA_COMBATLOG_XP": function(e)
        {
            //xp gain
            e.unit = e.targetname;
            e.key = e.xp_reason;
            e.type = "xp_reasons";
            expand(e);
        },
        "DOTA_COMBATLOG_PURCHASE": function(e)
        {
            //purchase
            e.unit = e.targetname;
            e.key = translate(e.valuename);
            e.value = 1;
            e.type = "purchase";
            expand(e);
            //don't include recipes in purchase logs
            if (e.key.indexOf("recipe_") !== 0)
            {
                var e2 = JSON.parse(JSON.stringify(e));
                e2.type = "purchase_log";
                expand(e2);
            }
        },
        "DOTA_COMBATLOG_BUYBACK": function(e)
        {
            //buyback
            e.slot = e.value; //player slot that bought back
            e.type = "buyback_log";
            expand(e);
        },
        "DOTA_COMBATLOG_ABILITY_TRIGGER": function(e)
        {
            //only seems to happen for axe spins
            e.type = "ability_trigger";
            //e.attackername //unit triggered on?
            //e.key = e.inflictor; //ability triggered?
            //e.unit = determineIllusion(e.targetname, e.targetillusion); //unit that triggered the skill
        },
        "DOTA_COMBATLOG_PLAYERSTATS": function(e)
        {
            //player stats
            //TODO: don't really know what this does, following fields seem to be populated
            //attackername
            //targetname
            //targetsourcename
            //value (1-15)
            e.type = "player_stats";
            e.unit = e.attackername;
            e.key = e.targetname;
        },
        "DOTA_COMBATLOG_MULTIKILL": function(e)
        {
            //multikill
            e.unit = e.attackername;
            //add the "minimum value", as of 2016-02-06
            //remove the "minimum value", as of 2016-06-23
            e.key = e.value;
            e.value = 1;
            e.type = "multi_kills";
            expand(e);
        },
        "DOTA_COMBATLOG_KILLSTREAK": function(e)
        {
            //killstreak
            e.unit = e.attackername;
            //add the "minimum value", as of 2016-02-06
            //remove the "minimum value", as of 2016-06-23
            e.key = e.value;
            e.value = 1;
            e.type = "kill_streaks";
            expand(e);
        },
        "DOTA_COMBATLOG_TEAM_BUILDING_KILL": function(e)
        {
            //team building kill
            //System.err.println(cle);
            e.type = "team_building_kill";
            e.unit = e.attackername; //unit that killed the building
            //e.value, this is only really useful if we can get WHICH tower/rax was killed
            //0 is other?
            //1 is tower?
            //2 is rax?
            //3 is ancient?
        },
        "DOTA_COMBATLOG_FIRST_BLOOD": function(e)
        {
            //first blood
            e.type = "first_blood";
            //time, involved players?
        },
        "DOTA_COMBATLOG_MODIFIER_REFRESH": function(e)
        {
            //modifier refresh
            e.type = "modifier_refresh";
            //no idea what this means
        },
        "clicks": function(e)
        {
            expand(e);
        },
        "pings": function(e)
        {
            //we're not breaking pings into subtypes atm so just set key to 0 for now
            e.key = 0;
            expand(e);
        },
        "actions": function(e)
        {
            expand(e);
        },
        "CHAT_MESSAGE_RUNE_PICKUP": function(e)
        {
            e.type = "runes";
            e.slot = e.player1;
            e.key = e.value.toString();
            e.value = 1;
            expand(e);
        },
        "CHAT_MESSAGE_RUNE_BOTTLE": function(e)
        {
            //not tracking rune bottling atm
        },
        "CHAT_MESSAGE_HERO_KILL": function(e)
        {
            //player, assisting players
            //player2 killed player 1
            //subsequent players assisted
            //still not perfect as dota can award kills to players when they're killed by towers/creeps and chat event does not reflect this
            //e.slot = e.player2;
            //e.key = e.player1.toString();
            //currently disabled in favor of combat log kills
        },
        "CHAT_MESSAGE_GLYPH_USED": function(e)
        {
            //team glyph
            //player1 = team that used glyph (2/3, or 0/1?)
            //e.team = e.player1;
        },
        "CHAT_MESSAGE_PAUSED": function(e)
        {
            //e.slot = e.player1;
            //player1 paused
        },
        "CHAT_MESSAGE_TOWER_KILL": function(e)
        {
            e.team = e.value;
            e.slot = e.player1;
            expand(e);
        },
        "CHAT_MESSAGE_TOWER_DENY": function(e)
        {
            //tower (player/team)
            //player1 = slot of player who killed tower (-1 if nonplayer)
            //value (2/3 radiant/dire killed tower, recently 0/1?)
            e.team = e.value;
            e.slot = e.player1;
            expand(e);
        },
        "CHAT_MESSAGE_BARRACKS_KILL": function(e)
        {
            //barracks (player)
            //value id of barracks based on power of 2?
            //Barracks can always be deduced 
            //They go in incremental powers of 2, starting by the Dire side to the Dire Side, Bottom to Top, Melee to Ranged
            //so Bottom Melee Dire Rax = 1 and Top Ranged Radiant Rax = 2048.
            e.key = e.value.toString();
            expand(e);
        },
        "CHAT_MESSAGE_FIRSTBLOOD": function(e)
        {
            e.slot = e.player1;
            expand(e);
        },
        "CHAT_MESSAGE_AEGIS": function(e)
        {
            e.slot = e.player1;
            expand(e);
        },
        "CHAT_MESSAGE_AEGIS_STOLEN": function(e)
        {
            e.slot = e.player1;
            expand(e);
        },
        "CHAT_MESSAGE_DENIED_AEGIS": function(e)
        {
            //aegis (player)
            //player1 = slot who picked up/denied/stole aegis
            e.slot = e.player1;
            expand(e);
        },
        "CHAT_MESSAGE_ROSHAN_KILL": function(e)
        {
            //player1 = team that killed roshan? (2/3)
            e.team = e.player1;
            expand(e);
        },
        "chat": function getChatSlot(e)
        {
            //e.slot = name_to_slot[e.unit];
            //push a copy to chat
            expand(e);
        },
        "interval": function(e)
        {
            if (e.time >= 0)
            {
                expand(e);
                var e2 = JSON.parse(JSON.stringify(e));
                e2.type = "stuns";
                e2.value = e2.stuns;
                expand(e2);
                //var e8 = JSON.parse(JSON.stringify(e));
                //e8.type = "pos";
                //e8.key = [e8.x, e8.y];
                //expand(e8);
                var e6 = JSON.parse(JSON.stringify(e));
                e6.type = "life_state";
                e6.key = e6.life_state;
                expand(e6);
                //if on minute, add to lh/gold/xp
                if (e.time % 60 === 0)
                {
                    var e3 = JSON.parse(JSON.stringify(e));
                    e3.interval = true;
                    e3.type = "times";
                    e3.value = e3.time;
                    expand(e3);
                    var e4 = JSON.parse(JSON.stringify(e));
                    e4.interval = true;
                    e4.type = "gold_t";
                    e4.value = e4.gold;
                    expand(e4);
                    var e5 = JSON.parse(JSON.stringify(e));
                    e5.interval = true;
                    e5.type = "xp_t";
                    e5.value = e5.xp;
                    expand(e5);
                    var e7 = JSON.parse(JSON.stringify(e));
                    e7.interval = true;
                    e7.type = "lh_t";
                    e7.value = e7.lh;
                    expand(e7);
                }
            }
            // store player position for the first 10 minutes
            if (e.time <= 600 && e.x && e.y)
            {
                var e9 = JSON.parse(JSON.stringify(e));
                e9.type = "lane_pos";
                e9.key = [e9.x, e9.y];
                e9.posData = true;
                expand(e9);
            }
        },
        "obs": function(e)
        {
            var e2 = JSON.parse(JSON.stringify(e));
            e2.type = "obs_log";
            expand(e2);
            var e3 = JSON.parse(JSON.stringify(e));
            //key is a JSON array of position data
            e3.key = JSON.parse(e3.key);
            e3.posData = true;
            expand(e3);
        },
        "sen": function(e)
        {
            var e2 = JSON.parse(JSON.stringify(e));
            e2.type = "sen_log";
            expand(e2);
            var e3 = JSON.parse(JSON.stringify(e));
            e3.key = JSON.parse(e3.key);
            e3.posData = true;
            expand(e3);
        },
    };
    //define the types we want to put into each array
    //null means all types
    var reqs = {
        parsed_data: null,
        //expanded: null,
        tf_data:
        {
            killed: 1,
            interval: 1,
            buyback_log: 1,
            damage: 1,
            healing: 1,
            gold_reasons: 1,
            xp_reasons: 1,
            ability_uses: 1,
            item_uses: 1
        },
        int_data:
        {
            interval: 1
        },
        uploadProps:
        {
            epilogue: 1,
            interval: 1
        }
    };
    var res = {};
    for (var i = 0; i < entries.length; i++)
    {
        var e = entries[i];
        if (types[e.type])
        {
            //preprocess based on type name
            types[e.type](e);
        }
        else
        {
            //expand if not specified
            expand(e);
        }
    }
    return res;
    /**
     * Strips off "item_" from strings, and nullifies dota_unknown.  Does not mutate the original string.
     **/
    function translate(input)
    {
        if (input === "dota_unknown")
        {
            return null;
        }
        if (input && input.indexOf("item_") === 0)
        {
            return input.slice(5);
        }
        return input;
    }
    /**
     * Prepends illusion_ to string if illusion
     **/
    function computeIllusionString(input, isIllusion)
    {
        return (isIllusion ? "illusion_" : "") + input;
    }
    /**
     * Place the entry in the output arrays
     **/
    function expand(e)
    {
        //set slot and player_slot
        e.slot = ("slot" in e) ? e.slot : meta.hero_to_slot[e.unit];
        e.player_slot = meta.slot_to_playerslot[e.slot];
        for (var key in reqs)
        {
            if (!res[key])
            {
                res[key] = [];
            }
            if (!reqs[key] || (e.type in reqs[key]))
            {
                res[key].push(e);
            }
        }
    }
}
module.exports = processExpand;
