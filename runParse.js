var request = require('request');
var cp = require('child_process');
var utility = require('./utility');
var ndjson = require('ndjson');
var spawn = cp.spawn;
var progress = require('request-progress');

module.exports = function runParse(match, cb)
{
    var print_multi_kill_streak_debugging = false;
    var url = match.url;
    var inStream;
    var parseStream;
    var bz;
    var parser;
    //parse state
    var entries = [];
    var hero_to_slot = {};
    var hero_to_id = {};
    var slot_to_playerslot = {};
    //var curr_player_hero = {};
    var game_zero = 0;
    var curr_teamfight;
    var teamfights = [];
    var intervalState = {};
    var teamfight_cooldown = 15;
    var parsed_data = null;
    inStream = progress(request(
    {
        url: url,
        encoding: null,
        timeout: 30000
    })).on('progress', function(state)
    {
        console.log(JSON.stringify(
        {
            url: url,
            percent: state.percent
        }));
    }).on('response', function(response)
    {
        if (response.statusCode === 200)
        {
            //TODO replace domain with something that can handle exceptions with context
            parser = spawn("java", ["-jar",
                    "-Xmx64m",
                    "java_parser/target/stats-0.1.0.jar"
                ],
            {
                //we may want to ignore stderr so the child doesn't stay open
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf8'
            });
            parseStream = ndjson.parse();
            if (url.slice(-3) === "bz2")
            {
                bz = spawn("bunzip2");
                inStream.pipe(bz.stdin);
                bz.stdout.pipe(parser.stdin);
            }
            else
            {
                inStream.pipe(parser.stdin);
            }
            parser.stdout.pipe(parseStream);
            parser.stderr.on('data', function(data)
            {
                console.log(data.toString());
            });
            parseStream.on('data', handleStream);
            parseStream.on('end', exit);
            parseStream.on('error', exit);
        }
        else
        {
            exit(response.statusCode.toString());
        }
    }).on('error', exit);

    function exit(err)
    {
        if (!err)
        {
            parsed_data = utility.getParseSchema();
            var message = "time spent on post-processing match ";
            console.time(message);
            preprocessEventBuffer();
            processEventBuffer();
            processTeamfights();
            processAllPlayers();
            //processMultiKillStreaks();
            //processReduce();
            console.timeEnd(message);
        }
        return cb(err, parsed_data);
    }
    //callback when the JSON stream encounters a JSON object (event)
    function handleStream(e)
    {
        entries.push(e);
    }

    function preprocessEventBuffer()
    {
        var preTypes = {
            "DOTA_COMBATLOG_GAME_STATE": function(e)
            {
                //capture the replay time at which the game clock was 0:00
                //5 is playing
                //https://github.com/skadistats/clarity/blob/master/src/main/java/skadistats/clarity/model/s1/GameRulesStateType.java
                if (e.value === 5)
                {
                    game_zero = e.time;
                }
            },
            "interval": function(e)
            {
                //check if hero has been assigned to entity
                if (e.hero_id)
                {
                    //grab the end of the name, lowercase it
                    var ending = e.unit.slice("CDOTA_Unit_Hero_".length);
                    //valve is bad at consistency and the combat log name could involve replacing camelCase with _ or not!
                    //double map it so we can look up both cases
                    var combatLogName = "npc_dota_hero_" + ending.toLowerCase();
                    //don't include final underscore here since the first letter is always capitalized and will be converted to underscore
                    var combatLogName2 = "npc_dota_hero" + ending.replace(/([A-Z])/g, function($1)
                    {
                        return "_" + $1.toLowerCase();
                    }).toLowerCase();
                    //console.log(combatLogName, combatLogName2);
                    //populate hero_to_slot for combat log mapping
                    hero_to_slot[combatLogName] = e.slot;
                    hero_to_slot[combatLogName2] = e.slot;
                    //populate hero_to_id for multikills
                    //hero_to_id[combatLogName] = e.hero_id;
                    //hero_to_id[combatLogName2] = e.hero_id;
                }
            },
            "player_slot": function(e)
            {
                //map slot number (0-9) to playerslot (0-4, 128-132)
                slot_to_playerslot[e.key] = e.value;
            }
        };
        for (var i = 0; i < entries.length; i++)
        {
            var e = entries[i];
            if (preTypes[e.type])
            {
                preTypes[e.type](e);
            }
        }
    }
    //Correct timeshift, add player slot data for all events collected in buffer
    function processEventBuffer()
    {
        var types = {
            "player_slot": function(e)
            {
                parsed_data.players[e.key].player_slot = e.value;
            },
            "match_id": function(e)
            {
                parsed_data.match_id = e.value;
            },
            "DOTA_COMBATLOG_DAMAGE": function(e)
            {
                //damage
                e.unit = e.sourcename; //source of damage (a hero)
                e.key = computeIllusionString(e.targetname, e.targetillusion);
                //count damage dealt to unit
                e.type = "damage";
                populate(e);
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
                    populate(r);
                    //count a hit on a real hero with this inflictor
                    var h = {
                        time: e.time,
                        unit: e.unit,
                        key: translate(e.inflictor),
                        type: "hero_hits"
                    };
                    populate(h);
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
                        populate(inf);
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
                        populate(m);
                    }
                }
            },
            "DOTA_COMBATLOG_HEAL": function(e)
            {
                //healing
                e.unit = e.sourcename; //source of healing (a hero)
                e.key = computeIllusionString(e.targetname, e.targetillusion);
                e.type = "healing";
                populate(e);
            },
            "DOTA_COMBATLOG_MODIFIER_ADD": function(e)
            {
                //gain buff/debuff
                e.unit = e.attackername; //unit that buffed (can we use source to get the hero directly responsible? chen/enchantress/etc.)
                e.key = translate(e.inflictor); //the buff
                //e.targetname is target of buff (possibly illusion)
                e.type = "modifier_applied";
                populate(e);
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
                //code to log objectives via combat log, we currently do it with objectives (chat events)
                // var logs = ["_tower", "_rax", "_fort", "_roshan"];
                // var isObjective = logs.some(function(s) {
                //     return (e.key.indexOf(s) !== -1 && !e.target_illusion);
                // });
                // if (isObjective) {
                //     //push a copy to objectives
                //     parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
                // }
                //count kill by this unit
                e.type = "killed";
                populate(e);
                //killed unit was a real hero
                if (e.targethero && !e.targetillusion)
                {
                    //log this hero kill
                    var e2 = JSON.parse(JSON.stringify(e));
                    e2.type = "kills_log";
                    populate(e2);
                    //reverse and count as killed by
                    //if the killed unit isn't a hero, we don't care about killed_by
                    var r = {
                        time: e.time,
                        unit: e.key,
                        key: e.unit,
                        type: "killed_by"
                    };
                    populate(r);
                    //check teamfight state
                    curr_teamfight = curr_teamfight ||
                    {
                        start: e.time - teamfight_cooldown,
                        end: null,
                        last_death: e.time,
                        deaths: 0,
                        players: Array.apply(null, new Array(parsed_data.players.length)).map(function()
                        {
                            return {
                                deaths_pos:
                                {},
                                ability_uses:
                                {},
                                item_uses:
                                {},
                                killed:
                                {},
                                deaths: 0,
                                buybacks: 0,
                                damage: 0,
                                gold_delta: 0,
                                xp_delta: 0
                            };
                        })
                    };
                    //update the last_death time of the current fight
                    curr_teamfight.last_death = e.time;
                    curr_teamfight.deaths += 1;
                }
            },
            "DOTA_COMBATLOG_ABILITY": function(e)
            {
                //ability use
                e.unit = e.attackername;
                e.key = translate(e.inflictor);
                e.type = "ability_uses";
                populate(e);
            },
            "DOTA_COMBATLOG_ITEM": function(e)
            {
                //item use
                e.unit = e.attackername;
                e.key = translate(e.inflictor);
                e.type = "item_uses";
                populate(e);
            },
            "DOTA_COMBATLOG_LOCATION": function(e)
            {
                //TODO not in replay?
                console.log(e);
            },
            "DOTA_COMBATLOG_GOLD": function(e)
            {
                //gold gain/loss
                e.unit = e.targetname;
                e.key = e.gold_reason;
                //gold_reason=8 is cheats, not added to constants
                e.type = "gold_reasons";
                populate(e);
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
                populate(e);
            },
            "DOTA_COMBATLOG_PURCHASE": function(e)
            {
                //purchase
                e.unit = e.targetname;
                e.key = translate(e.valuename);
                e.value = 1;
                e.type = "purchase";
                populate(e);
                //don't include recipes in purchase logs
                if (e.key.indexOf("recipe_") !== 0)
                {
                    var e2 = JSON.parse(JSON.stringify(e));
                    e2.type = "purchase_log";
                    populate(e2);
                }
            },
            "DOTA_COMBATLOG_BUYBACK": function(e)
            {
                //buyback
                e.slot = e.value; //player slot that bought back
                e.type = "buyback_log";
                populate(e);
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
                e.key = e.value;
                e.value = 1;
                e.type = "multi_kills";
                populate(e);
            },
            "DOTA_COMBATLOG_KILLSTREAK": function(e)
            {
                //killstreak
                e.unit = e.attackername;
                e.key = e.value;
                e.value = 1;
                e.type = "kill_streaks";
                populate(e);
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
                populate(e);
            },
            "pings": function(e)
            {
                //we're not breaking pings into subtypes atm so just set key to 0 for now
                e.key = 0;
                populate(e);
            },
            "actions": function(e)
            {
                populate(e);
            },
            "CHAT_MESSAGE_RUNE_PICKUP": function(e)
            {
                e.type = "runes";
                e.slot = e.player1;
                e.key = e.value.toString();
                e.value = 1;
                populate(e);
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
                //populate(e);
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
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            "CHAT_MESSAGE_TOWER_DENY": function(e)
            {
                //tower (player/team)
                //player1 = slot of player who killed tower (-1 if nonplayer)
                //value (2/3 radiant/dire killed tower, recently 0/1?)
                e.team = e.value;
                e.slot = e.player1;
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            "CHAT_MESSAGE_BARRACKS_KILL": function(e)
            {
                //barracks (player)
                //value id of barracks based on power of 2?
                //Barracks can always be deduced 
                //They go in incremental powers of 2, starting by the Dire side to the Dire Side, Bottom to Top, Melee to Ranged
                //so Bottom Melee Dire Rax = 1 and Top Ranged Radiant Rax = 2048.
                e.key = e.value.toString();
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            "CHAT_MESSAGE_FIRSTBLOOD": function(e)
            {
                e.slot = e.player1;
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            "CHAT_MESSAGE_AEGIS": function(e)
            {
                e.slot = e.player1;
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            "CHAT_MESSAGE_AEGIS_STOLEN": function(e)
            {
                e.slot = e.player1;
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            "CHAT_MESSAGE_AEGIS_DENIED": function(e)
            {
                //aegis (player)
                //player1 = slot who picked up/denied/stole aegis
                e.slot = e.player1;
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            "CHAT_MESSAGE_ROSHAN_KILL": function(e)
            {
                //player1 = team that killed roshan? (2/3)
                e.team = e.player1;
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            },
            //CHAT_MESSAGE_UNPAUSED = 36;
            //CHAT_MESSAGE_COURIER_LOST = 10;
            //CHAT_MESSAGE_COURIER_RESPAWNED = 11;
            //"CHAT_MESSAGE_SUPER_CREEPS"
            //"CHAT_MESSAGE_HERO_DENY"
            //"CHAT_MESSAGE_STREAK_KILL"
            //"CHAT_MESSAGE_BUYBACK"
            "chat": function getChatSlot(e)
            {
                //e.slot = name_to_slot[e.unit];
                //push a copy to chat
                parsed_data.chat.push(JSON.parse(JSON.stringify(e)));
            },
            "interval": function(e)
            {
                //store hero state at each interval for teamfight lookup
                if (!intervalState[e.time])
                {
                    intervalState[e.time] = {};
                }
                intervalState[e.time][e.slot] = e;
                //check curr_teamfight status
                if (curr_teamfight && e.time - curr_teamfight.last_death >= teamfight_cooldown)
                {
                    //close it
                    curr_teamfight.end = e.time;
                    //push a copy for post-processing
                    teamfights.push(JSON.parse(JSON.stringify(curr_teamfight)));
                    //clear existing teamfight
                    curr_teamfight = null;
                }
                if (e.time >= 0)
                {
                    var e2 = JSON.parse(JSON.stringify(e));
                    e2.type = "stuns";
                    e2.value = e2.stuns;
                    populate(e2);
                    //if on minute, add to lh/gold/xp
                    if (e.time % 60 === 0)
                    {
                        var e3 = JSON.parse(JSON.stringify(e));
                        e3.interval = true;
                        e3.type = "times";
                        e3.value = e3.time;
                        populate(e3);
                        e3.type = "gold_t";
                        e3.value = e3.gold;
                        populate(e3);
                        e3.type = "xp_t";
                        e3.value = e3.xp;
                        populate(e3);
                        e3.type = "lh_t";
                        e3.value = e3.lh;
                        populate(e3);
                    }
                    //add to positions
                    //not currently storing pos data
                    //make a copy if mutating
                    // if (e.x && e.y) {
                    //     e.type = "pos";
                    //     e.key = [e.x, e.y];
                    //     e.posData = true;
                    //     //populate(e);
                    // }
                }
                // store player position for the first 10 minutes
                if (e.time <= 600 && e.x && e.y)
                {
                    var e4 = JSON.parse(JSON.stringify(e));
                    e4.type = "lane_pos";
                    e4.key = [e4.x, e4.y];
                    e4.posData = true;
                    populate(e4);
                }
            },
            "obs": function(e)
            {
                //key is a JSON array of position data
                e.key = JSON.parse(e.key);
                e.posData = true;
                populate(e);
                e.posData = false;
                e.type = "obs_log";
                populate(e);
            },
            "sen": function(e)
            {
                e.key = JSON.parse(e.key);
                e.posData = true;
                populate(e);
                e.posData = false;
                e.type = "sen_log";
                populate(e);
            }
        };
        for (var i = 0; i < entries.length; i++)
        {
            var e = entries[i];
            //adjust time by zero value to get actual game time
            //we can only do this once stream is complete since the game start time (game_zero) is sent at some point in the stream
            e.time -= game_zero;
            if (types[e.type])
            {
                //save the original type so we can restore it (don't mutate data)
                var origType = e.type;
                types[e.type](e);
                //depending on the event type the e.unit (used to translate to e.slot which translates to e.player_slot, the grouping key) can be different fields in the event
                //after calling function in types the unit should be set properly so we can add slot and player_slot
                e.slot = ("slot" in e) ? e.slot : hero_to_slot[e.unit];
                e.player_slot = slot_to_playerslot[e.slot];
                e.type = origType;
            }
            else
            {
                //no event handler for this type, don't push it to event buffer
                console.log("no event handler for type %s", e.type);
            }
        }
    }
    //Group events in buffer
    function processReduce()
    {
        var reduceMap = {};
        //group by player_slot, type, targethero, targetillusion
        for (var i = 0; i < entries.length; i++)
        {
            //group big categories: actions, combat log damage
            var e = entries[i];
            //var identifier = [e.player_slot, e.type, e.targethero, e.targetillusion, e.key].join(":");
            //e.value = e.value || 1;
            var identifier = e.type;
            e.value = 1;
            reduceMap[identifier] = reduceMap[identifier] ? reduceMap[identifier] + e.value : e.value || 1;
        }
        console.log(reduceMap);
    }
    
    //Compute data requiring all players in a match for storage in match table
    function processAllPlayers()
    {
        var goldAdvTime = {};
        var xpAdvTime = {};
        for (var i = 0; i < entries.length; i++)
        {
            var e = entries[i];
            if (e.type === "interval" && e.time % 60 === 0)
            {
                var g = utility.isRadiant(
                {
                    player_slot: e.player_slot
                }) ? e.gold : -e.gold;
                var x = utility.isRadiant(
                {
                    player_slot: e.player_slot
                }) ? e.xp : -e.xp;
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
            parsed_data.radiant_gold_adv.push(goldAdvTime[k]);
            parsed_data.radiant_xp_adv.push(xpAdvTime[k]);
        });
    }
    //Compute teamfights that occurred
    function processTeamfights()
    {
        //fights that didnt end wont be pushed to teamfights array (endgame case)
        //filter only fights where 3+ heroes died
        teamfights = teamfights.filter(function(tf)
        {
            return tf.deaths >= 3;
        });
        teamfights.forEach(function(tf)
        {
            tf.players.forEach(function(p, ind)
            {
                //record player's start/end xp for level change computation
                if (intervalState[tf.start] && intervalState[tf.end])
                {
                    p.xp_start = intervalState[tf.start][ind].xp;
                    p.xp_end = intervalState[tf.end][ind].xp;
                }
            });
        });
        for (var i = 0; i < entries.length; i++)
        {
            //loop over entries again
            var e = entries[i];
            //check each teamfight to see if this event should be processed as part of that teamfight
            for (var j = 0; j < teamfights.length; j++)
            {
                var tf = teamfights[j];
                if (e.time >= tf.start && e.time <= tf.end)
                {
                    if (e.type === "DOTA_COMBATLOG_DEATH" && e.targethero && !e.targetillusion)
                    {
                        //copy the entry and populate
                        var e_cpy_1 = JSON.parse(JSON.stringify(e));
                        e_cpy_1.type = "killed";
                        populate(e_cpy_1, tf);
                        //reverse the kill entry to find killed hero
                        var r = {
                            time: e.time,
                            slot: hero_to_slot[e.key]
                        };
                        if (intervalState[r.time][r.slot])
                        {
                            //if a hero dies, add to deaths_pos, lookup slot of the killed hero by hero name (e.key), get position from intervalstate
                            var x = intervalState[r.time][r.slot].x;
                            var y = intervalState[r.time][r.slot].y;
                            //fill in the copy
                            r.type = "deaths_pos";
                            r.key = [x, y];
                            r.posData = true;
                            populate(r, tf);
                            //increment death count for this hero
                            tf.players[r.slot].deaths += 1;
                        }
                    }
                    else if (e.type === "DOTA_COMBATLOG_BUYBACK")
                    {
                        //bought back
                        if (tf.players[e.slot])
                        {
                            tf.players[e.slot].buybacks += 1;
                        }
                    }
                    else if (e.type === "DOTA_COMBATLOG_DAMAGE")
                    {
                        //sum damage
                        //check if damage dealt to hero and not illusion
                        if (e.targethero && !e.targetillusion)
                        {
                            //check if the damage dealer could be assigned to a slot
                            if (tf.players[e.slot])
                            {
                                tf.players[e.slot].damage += e.value;
                            }
                        }
                    }
                    else if (e.type === "DOTA_COMBATLOG_GOLD" || e.type === "DOTA_COMBATLOG_XP")
                    {
                        //add gold/xp to delta
                        if (tf.players[e.slot])
                        {
                            var types = {
                                "DOTA_COMBATLOG_GOLD": "gold_delta",
                                "DOTA_COMBATLOG_XP": "xp_delta"
                            };
                            tf.players[e.slot][types[e.type]] += e.value;
                        }
                    }
                    else if (e.type === "DOTA_COMBATLOG_ABILITY" || e.type === "DOTA_COMBATLOG_ITEM")
                    {
                        var e2 = JSON.parse(JSON.stringify(e));
                        e2.type = e.type === "DOTA_COMBATLOG_ABILITY" ? "ability_uses" : "item_uses";
                        //count skills, items
                        populate(e2, tf);
                    }
                    else
                    {
                        continue;
                    }
                }
            }
        }
        parsed_data.teamfights = teamfights;
    }
    // associate kill streaks with multi kills and team fights
    function processMultiKillStreaks()
    {
        // bookkeeping about each player
        var players = {};
        // for each entry in the combat log
        for (var i = 0; i < entries.length; i++)
        {
            var entry = entries[i];
            // identify the killer
            var killer = entry.unit;
            var killer_index = hero_to_slot[killer];
            // if the killer is a hero (which it might not be)
            if (killer_index !== undefined)
            {
                // bookmark this player's parsed bookkeeping
                var parsed_info = parsed_data.players[killer_index];
                // if needed, initialize this player's bookkeeping
                if (players[killer_index] === undefined)
                {
                    parsed_info.kill_streaks_log.push([]);
                    players[killer_index] = {
                        "cur_multi_id": 0, // the id of the current multi kill
                        "cur_multi_val": 0, // the value of the current multi kill
                        "cur_streak_budget": 2 // the max length of the current kill streak
                    };
                }
                // get the number of streaks and the length of the current streak
                var all_streak_length = parsed_info.kill_streaks_log.length;
                var cur_streak_length = parsed_info.kill_streaks_log[all_streak_length - 1].length;
                // bookmark this player's local bookkeeping
                var local_info = players[killer_index];
                // if this entry is a valid kill notification
                if (entry.type === "killed" && entry.targethero && !entry.targetillusion)
                {
                    // determine who was killed
                    var killed = entry.key;
                    var killed_index = hero_to_slot[killed];
                    // if this is a valid kill (note: self-denies (via bloodstone, etc) are logged
                    // as kill events but do not break kill streaks or multi kills events)
                    if (killer_index != killed_index)
                    {
                        // check if we've run out of room in the current kills array (note: this
                        // would happen because (for some reason) the combat log does not contain
                        // kill streak events for streaks of size 2 (even though it really should))
                        var cur_streak_budget = local_info.cur_streak_budget;
                        if (cur_streak_length == cur_streak_budget && cur_streak_budget == 2)
                        {
                            // remove the first element of the streak (note: later we will
                            // push a new second element on to the end of the streak)
                            parsed_info.kill_streaks_log[all_streak_length - 1].splice(0, 1);
                            cur_streak_length--;
                            // check if the current kill streak has ended
                        }
                        else if (cur_streak_length >= cur_streak_budget)
                        {
                            // if so, create a new streak in the kills array
                            all_streak_length++;
                            cur_streak_length = 0;
                            parsed_info.kill_streaks_log.push([]);
                            local_info.cur_streak_budget = 2;
                            if (print_multi_kill_streak_debugging)
                            {
                                console.log("\t%s kill streak has ended", killer);
                            }
                        }
                        // check if the current multi kill has ended
                        if (local_info.cur_multi_val < parsed_info.multi_kill_id_vals[local_info.cur_multi_id])
                        {
                            // if not, increment the current multi kill value
                            local_info.cur_multi_val++;
                        }
                        else
                        {
                            // if so, create a new multi kill id and value
                            local_info.cur_multi_id++;
                            local_info.cur_multi_val = 1;
                            parsed_info.multi_kill_id_vals.push(1);
                            if (print_multi_kill_streak_debugging)
                            {
                                console.log("\t%s multi kill has ended", killer);
                            }
                        }
                        // determine if this kill was part of a team fight
                        var team_fight_id = 0;
                        var kill_time = entry.time;
                        for (var j = 0; j < teamfights.length; j++)
                        {
                            var teamfight = teamfights[j];
                            if (kill_time >= teamfight.start && kill_time <= teamfight.end)
                            {
                                team_fight_id = j + 1;
                            }
                        }
                        // add this kill to the killer's list of kills
                        parsed_info.kill_streaks_log[all_streak_length - 1].push(
                        {
                            "hero_id": hero_to_id[killed],
                            "multi_kill_id": local_info.cur_multi_id,
                            "team_fight_id": team_fight_id,
                            "time": kill_time
                        });
                        if (print_multi_kill_streak_debugging)
                        {
                            console.log("\t%s killed %s", killer, killed);
                        }
                    }
                    // if this entry is a notification of a multi kill (note: the kill that caused
                    // this multi kill has not been seen yet; it will one of the next few entries)
                }
                else if (entry.type === "multi_kills")
                {
                    // update the value of the current multi kill
                    parsed_info.multi_kill_id_vals[local_info.cur_multi_id] = parseInt(entry.key);
                    if (print_multi_kill_streak_debugging)
                    {
                        console.log("\t%s got a multi kill of %s", killer, entry.key);
                    }
                    // if this entry is a notification of a kill streak (note: the kill that caused
                    // this kill streak has not been seen yet; it will one of the next few entries)
                }
                else if (entry.type === "kill_streaks")
                {
                    // update the value of the current kill streak
                    local_info.cur_streak_budget = parseInt(entry.key);
                    if (print_multi_kill_streak_debugging)
                    {
                        console.log("\t%s got a kill streak of %s", killer, entry.key);
                    }
                }
            }
        }
        // remove small (length < 3) kill streaks
        for (var index in players)
        {
            var data = parsed_data.players[index].kill_streaks_log;
            var i = data.length;
            while (i--)
            {
                if (data[i].length < 3)
                {
                    data.splice(i, 1);
                }
            }
        }
    }
    //strips off "item_" from strings
    function translate(input)
    {
        if (input != null)
        {
            if (input.indexOf("item_") === 0)
            {
                input = input.slice(5);
            }
        }
        return input;
    }
    //prepends illusion_ to string if illusion
    function computeIllusionString(input, isIllusion)
    {
        return (isIllusion ? "illusion_" : "") + input;
    }

    function populate(e, container)
    {
        //set slot and player_slot
        e.slot = ("slot" in e) ? e.slot : hero_to_slot[e.unit];
        e.player_slot = slot_to_playerslot[e.slot];
        //use parsed_data by default if nothing passed in
        container = container || parsed_data;
        if (!container.players[e.slot])
        {
            //couldn't associate with a player, probably attributed to a creep/tower/necro unit
            //console.log(e);
            return;
        }
        var t = container.players[e.slot][e.type];
        if (typeof t === "undefined")
        {
            //container.players[0] doesn't have a type for this event
            console.log("no field in parsed_data.players for %s", JSON.stringify(e));
            return;
        }
        else if (e.posData)
        {
            //fill 2d hash with x,y values
            var x = e.key[0];
            var y = e.key[1];
            if (!t[x])
            {
                t[x] = {};
            }
            if (!t[x][y])
            {
                t[x][y] = 0;
            }
            t[x][y] += 1;
        }
        else if (e.max)
        {
            //check if value is greater than what was stored
            if (e.value > t.value)
            {
                container.players[e.slot][e.type] = e;
            }
        }
        else if (t.constructor === Array)
        {
            //determine whether we want the value only (interval) or the time and key (log)
            //either way this creates a new value so e can be mutated later
            var arrEntry = (e.interval) ? e.value :
            {
                time: e.time,
                key: e.key
            };
            t.push(arrEntry);
        }
        else if (typeof t === "object")
        {
            //add it to hash of counts
            e.value = e.value || 1;
            t[e.key] ? t[e.key] += e.value : t[e.key] = e.value;
            if (print_multi_kill_streak_debugging)
            {
                if (e.type == "kill_streaks")
                {
                    console.log("\t%s got a kill streak of %s", e.unit, e.key);
                }
                else if (e.type == "multi_kills")
                {
                    console.log("\t%s got a multi kill of %s", e.unit, e.key);
                }
            }
        }
        else if (typeof t === "string")
        {
            //string, used for steam id
            container.players[e.slot][e.type] = e.key;
        }
        else
        {
            //we must use the full reference since this is a primitive type
            //use the value most of the time, but key when stuns since value only holds Integers in Java
            //replace the value directly
            container.players[e.slot][e.type] = e.value || Number(e.key);
        }
    }
}
