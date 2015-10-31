var config = require('./config');
var express = require('express');
var request = require('request');
var fs = require('fs');
var cp = require('child_process');
var utility = require('./utility');
var ndjson = require('ndjson');
var spawn = cp.spawn;
var exec = cp.exec;
var bodyParser = require('body-parser');
var progress = require('request-progress');
//var constants = require('./constants.js');
var app = express();
//var capacity = require('os').cpus().length;
var capacity = Number(config.PARSER_PARALLELISM);
var cluster = require('cluster');
var port = config.PORT || config.PARSER_PORT;
if (cluster.isMaster && config.NODE_ENV !== "test") {
    // Fork workers.
    for (var i = 0; i < capacity; i++) {
        cluster.fork();
    }
    cluster.on('exit', function(worker, code, signal) {
        cluster.fork();
    });
}
else {
    var server = app.listen(port, function() {
        var host = server.address().address;
        console.log('[PARSER] listening at http://%s:%s', host, port);
    });
    app.use(bodyParser.json());
    app.post('/deploy', function(req, res) {
        var err = false;
        //TODO verify the POST is from github/secret holder
        if (req.body.ref === "refs/heads/master") {
            console.log(req.body);
            //run the deployment command
            //var debugFile = fs.openSync("./deploy_debug.txt", "a+");
            /*
            var child = spawn('npm run deploy-parser', null, {
                cwd: process.cwd(),
                detached: true,
                stdio: ['ignore', 'ignore', 'ignore']
            });
            */
            var child = exec('npm run deploy-parser', function(error, stdout, stderr) {
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
                if (error) {
                    console.log('exec error: ' + error);
                }
            });
            child.unref();
            console.log(child);
        }
        else {
            err = "not passing deploy conditions";
        }
        res.json({
            error: err
        });
    });
    app.get('/', function(req, res, next) {
        if (!req.query.url) {
            return res.json({
                capacity: capacity
            });
        }
        
        var timeout = setTimeout(function() {
            return res.json({
                error: "Parse took too long"
            });
            
            console.log("Parse took too long");
            
            process.exit(1);
            
        }, 2 * 60 * 1000);
        
        runParse(req.query, function(err, parsed_data) {
            
            clearTimeout(timeout);
            
            if (err) {
                console.error("error occurred for query: %s: %s", JSON.stringify(req.query), err.stack || err);
                res.json({
                    error: err.message || err.code || err
                });
                //can crash the worker and let master respawn to ensure process cleanup
                //however, this can result in losing other parses in progress if there is more than one being handled by this worker
                /*
                if (config.NODE_ENV==="test"){
                    process.exit(1);
                }
                */
            }
            else {
                return res.json(parsed_data);
            }
        });
    });
}

function runParse(data, cb) {
    var print_multi_kill_streak_debugging = false;
    var url = data.url;
    var error = "incomplete";
    var inStream;
    var parseStream;
    var bz;
    var parser;
    //parse state
    var entries = [];
    var hero_to_slot = {};
    var hero_to_id = {};
    var curr_player_hero = {};
    var game_zero = 0;
    var curr_teamfight;
    var teamfights = [];
    var intervalState = {};
    var teamfight_cooldown = 15;
    var parsed_data = null;
    //parse logic
    //capture events streamed from parser and set up state for post-processing
    //these events are generally not pushed to event buffer
    var streamTypes = {
        "state": function(e) {
            //capture the replay time at which the game clock was 0:00
            if (e.key === "PLAYING") {
                game_zero = e.time;
            }
            //console.log(e);
        },
        "epilogue": function() {
            error = null;
        }
    };
    var types = {
        "match_id": function(e) {
            parsed_data.match_id = e.value;
        },
        "combat_log": function(e) {
            switch (e.subtype) {
                case "DOTA_COMBATLOG_DAMAGE":
                    //damage
                    e.unit = e.sourcename; //source of damage (a hero)
                    e.key = computeIllusionString(e.targetname, e.targetillusion);
                    //count damage dealt to unit
                    e.type = "damage";
                    getSlot(e);
                    //check if this damage happened to a real hero
                    if (e.targethero && !e.targetillusion) {
                        //reverse and count as damage taken (see comment for reversed kill)
                        var r = {
                            time: e.time,
                            unit: e.key,
                            key: e.unit,
                            value: e.value,
                            type: "damage_taken"
                        };
                        getSlot(r);
                        //count a hit on a real hero with this inflictor
                        var h = {
                            time: e.time,
                            unit: e.unit,
                            key: translate(e.inflictor),
                            type: "hero_hits"
                        };
                        getSlot(h);
                        //don't count self-damage for the following
                        if (e.key !== e.unit) {
                            //count damage dealt to a real hero with this inflictor
                            var inf = {
                                type: "damage_inflictor",
                                time: e.time,
                                unit: e.unit,
                                key: translate(e.inflictor),
                                value: e.value
                            };
                            getSlot(inf);
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
                            getSlot(m);
                        }
                    }
                    break;
                case "DOTA_COMBATLOG_HEAL":
                    //healing
                    e.unit = e.sourcename; //source of healing (a hero)
                    e.key = computeIllusionString(e.targetname, e.targetillusion);
                    e.type = "healing";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_MODIFIER_ADD":
                    //gain buff/debuff
                    e.unit = e.attackername; //unit that buffed (can we use source to get the hero directly responsible? chen/enchantress/etc.)
                    e.key = translate(e.inflictor); //the buff
                    //e.targetname is target of buff (possibly illusion)
                    e.type = "modifier_applied";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_MODIFIER_REMOVE":
                    //lose buff/debuff
                    //TODO: do something with modifier lost events, really only useful if we want to try to "time" modifiers
                    //e.targetname is unit losing buff (possibly illusion)
                    //e.inflictor is name of buff
                    e.type = "modifier_lost";
                    break;
                case "DOTA_COMBATLOG_DEATH":
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
                    getSlot(e);
                    //killed unit was a real hero
                    if (e.targethero && !e.targetillusion) {
                        //log this hero kill
                        e.type = "kills_log";
                        populate(e);
                        //reverse and count as killed by
                        //if the killed unit isn't a hero, we don't care about killed_by
                        var r = {
                            time: e.time,
                            unit: e.key,
                            key: e.unit,
                            type: "killed_by"
                        };
                        getSlot(r);
                        //check teamfight state
                        curr_teamfight = curr_teamfight || {
                            start: e.time - teamfight_cooldown,
                            end: null,
                            last_death: e.time,
                            deaths: 0,
                            players: Array.apply(null, new Array(parsed_data.players.length)).map(function() {
                                return {
                                    deaths_pos: {},
                                    ability_uses: {},
                                    item_uses: {},
                                    killed: {},
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
                    break;
                case "DOTA_COMBATLOG_ABILITY":
                    //ability use
                    e.unit = e.attackername;
                    e.key = translate(e.inflictor);
                    e.type = "ability_uses";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_ITEM":
                    //item use
                    e.unit = e.attackername;
                    e.key = translate(e.inflictor);
                    e.type = "item_uses";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_LOCATION":
                    //TODO not in replay?
                    console.log(e);
                    break;
                case "DOTA_COMBATLOG_GOLD":
                    //gold gain/loss
                    e.unit = e.targetname;
                    e.key = e.gold_reason;
                    //gold_reason=8 is cheats, not added to constants
                    e.type = "gold_reasons";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_GAME_STATE":
                    //state
                    //we don't use this here since we need to capture it on the stream to detect game_zero
                    e.type = "state";
                    break;
                case "DOTA_COMBATLOG_XP":
                    //xp gain
                    e.unit = e.targetname;
                    e.key = e.xp_reason;
                    e.type = "xp_reasons";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_PURCHASE":
                    //purchase
                    e.unit = e.targetname;
                    e.key = translate(e.valuename);
                    e.value = 1;
                    e.type = "purchase";
                    getSlot(e);
                    //don't include recipes in purchase logs
                    if (e.key.indexOf("recipe_") !== 0) {
                        e.type = "purchase_log";
                        getSlot(e);
                    }
                    break;
                case "DOTA_COMBATLOG_BUYBACK":
                    //buyback
                    e.slot = e.value; //player slot that bought back
                    e.type = "buyback_log";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_ABILITY_TRIGGER":
                    //only seems to happen for axe spins
                    e.type = "ability_trigger";
                    //e.attackername //unit triggered on?
                    //e.key = e.inflictor; //ability triggered?
                    //e.unit = determineIllusion(e.targetname, e.targetillusion); //unit that triggered the skill
                    break;
                case "DOTA_COMBATLOG_PLAYERSTATS":
                    //player stats
                    //TODO: don't really know what this does, following fields seem to be populated
                    //attackername
                    //targetname
                    //targetsourcename
                    //value (1-15)
                    e.type = "player_stats";
                    e.unit = e.attackername;
                    e.key = e.targetname;
                    break;
                case "DOTA_COMBATLOG_MULTIKILL":
                    //multikill
                    e.unit = e.attackername;
                    e.key = e.value;
                    e.value = 1;
                    e.type = "multi_kills";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_KILLSTREAK":
                    //killstreak
                    e.unit = e.attackername;
                    e.key = e.value;
                    e.value = 1;
                    e.type = "kill_streaks";
                    getSlot(e);
                    break;
                case "DOTA_COMBATLOG_TEAM_BUILDING_KILL":
                    //team building kill
                    //System.err.println(cle);
                    e.type = "team_building_kill";
                    e.unit = e.attackername; //unit that killed the building
                    //e.value, this is only really useful if we can get WHICH tower/rax was killed
                    //0 is other?
                    //1 is tower?
                    //2 is rax?
                    //3 is ancient?
                    break;
                case "DOTA_COMBATLOG_FIRST_BLOOD":
                    //first blood
                    e.type = "first_blood";
                    //time, involved players?
                    break;
                case "DOTA_COMBATLOG_MODIFIER_REFRESH":
                    //modifier refresh
                    e.type = "modifier_refresh";
                    //no idea what this means
                    break;
                default:
                    console.log(e);
                    break;
            }
        },
        "clicks": function(e) {
            getSlot(e);
        },
        "pings": function(e) {
            //we're not breaking pings into subtypes atm so just set key to 0 for now
            e.key = 0;
            getSlot(e);
        },
        "actions": function(e) {
            getSlot(e);
        },
        "chat_event": function(e) {
            switch (e.subtype) {
                case "CHAT_MESSAGE_RUNE_PICKUP":
                    e.type = "runes";
                    e.slot = e.player1;
                    e.key = e.value.toString();
                    e.value = 1;
                    populate(e);
                    break;
                case "CHAT_MESSAGE_RUNE_BOTTLE":
                    //not tracking rune bottling atm
                    break;
                case "CHAT_MESSAGE_HERO_KILL":
                    //player, assisting players
                    //player2 killed player 1
                    //subsequent players assisted
                    //still not perfect as dota can award kills to players when they're killed by towers/creeps and chat event does not reflect this
                    e.type = e.subtype;
                    e.slot = e.player2;
                    e.key = e.player1.toString();
                    //currently disabled in favor of combat log kills
                    //populate(e);
                    break;
                case "CHAT_MESSAGE_GLYPH_USED":
                    //team glyph
                    //player1 = team that used glyph (2/3, or 0/1?)
                    e.team = e.player1;
                    break;
                case "CHAT_MESSAGE_PAUSED":
                    e.slot = e.player1;
                    //player1 paused
                    break;
                case "CHAT_MESSAGE_TOWER_KILL":
                case "CHAT_MESSAGE_TOWER_DENY":
                    //tower (player/team)
                    //player1 = slot of player who killed tower (-1 if nonplayer)
                    //value (2/3 radiant/dire killed tower, recently 0/1?)
                    e.team = e.value;
                    e.slot = e.player1;
                    parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
                    break;
                case "CHAT_MESSAGE_BARRACKS_KILL":
                    //barracks (player)
                    //value id of barracks based on power of 2?
                    //Barracks can always be deduced 
                    //They go in incremental powers of 2, starting by the Dire side to the Dire Side, Bottom to Top, Melee to Ranged
                    //so Bottom Melee Dire Rax = 1 and Top Ranged Radiant Rax = 2048.
                    e.key = e.value.toString();
                    parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
                    break;
                case "CHAT_MESSAGE_FIRSTBLOOD":
                    e.slot = e.player1;
                    parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
                    break;
                case "CHAT_MESSAGE_AEGIS":
                case "CHAT_MESSAGE_AEGIS_STOLEN":
                case "CHAT_MESSAGE_AEGIS_DENIED":
                    //aegis (player)
                    //player1 = slot who picked up/denied/stole aegis
                    e.slot = e.player1;
                    parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
                    break;
                case "CHAT_MESSAGE_ROSHAN_KILL":
                    //player1 = team that killed roshan? (2/3)
                    e.team = e.player1;
                    parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
                    break;
                    //case CHAT_MESSAGE_UNPAUSED = 36;
                    //case CHAT_MESSAGE_COURIER_LOST = 10;
                    //case CHAT_MESSAGE_COURIER_RESPAWNED = 11;
                    //case "CHAT_MESSAGE_SUPER_CREEPS"
                    //case "CHAT_MESSAGE_HERO_DENY"
                    //case "CHAT_MESSAGE_STREAK_KILL"
                    //currently using combat log buyback
                    //case "CHAT_MESSAGE_BUYBACK"
                default:
                    //console.log(e);
            }
        },
        "chat": function getChatSlot(e) {
            //e.slot = name_to_slot[e.unit];
            //push a copy to chat
            parsed_data.chat.push(JSON.parse(JSON.stringify(e)));
        },
        "interval": function(e) {
            //store hero state at each interval for teamfight lookup
            if (!intervalState[e.time]) {
                intervalState[e.time] = {};
            }
            intervalState[e.time][e.slot] = e;
            //check curr_teamfight status
            if (curr_teamfight && e.time - curr_teamfight.last_death >= teamfight_cooldown) {
                //close it
                curr_teamfight.end = e.time;
                //push a copy for post-processing
                teamfights.push(JSON.parse(JSON.stringify(curr_teamfight)));
                //clear existing teamfight
                curr_teamfight = null;
            }
            if (e.hero_id) {
                //grab the end of the name, lowercase it
                var ending = e.unit.slice("CDOTA_Unit_Hero_".length);
                //valve is bad at consistency and the combat log name could involve replacing camelCase with _ or not!
                //double map it so we can look up both cases
                var combatLogName = "npc_dota_hero_" + ending.toLowerCase();
                //don't include final underscore here since the first letter is always capitalized and will be converted to underscore
                var combatLogName2 = "npc_dota_hero" + ending.replace(/([A-Z])/g, function($1) {
                    return "_" + $1.toLowerCase();
                }).toLowerCase();
                //console.log(combatLogName, combatLogName2);
                //populate hero_to_slot for combat log mapping
                hero_to_slot[combatLogName] = e.slot;
                hero_to_slot[combatLogName2] = e.slot;
                //populate hero_to_id for multikills
                hero_to_id[combatLogName] = e.hero_id;
                hero_to_id[combatLogName2] = e.hero_id;
            }
            if (e.time >= 0) {
                e.type = "stuns";
                e.value = e.stuns;
                populate(e);
                //if on minute, add to lh/gold/xp
                if (e.time % 60 === 0) {
                    e.interval = true;
                    e.type = "times";
                    e.value = e.time;
                    populate(e);
                    e.type = "gold_t";
                    e.value = e.gold;
                    populate(e);
                    e.type = "xp_t";
                    e.value = e.xp;
                    populate(e);
                    e.type = "lh_t";
                    e.value = e.lh;
                    populate(e);
                    e.interval = false;
                }
                //add to positions
                //not currently storing pos data
                // if (e.x && e.y) {
                //     e.type = "pos";
                //     e.key = [e.x, e.y];
                //     e.posData = true;
                //     //populate(e);
                // }
            }
            // store player position for the first 10 minutes
            if (e.time <= 600 && e.x && e.y) {
                e.type = "lane_pos";
                e.key = [e.x, e.y];
                e.posData = true;
                populate(e);
            }
        },
        "obs": function(e) {
            e.key = JSON.parse(e.key);
            e.posData = true;
            populate(e);
            e.posData = false;
            e.type = "obs_log";
            populate(e);
        },
        "sen": function(e) {
            e.key = JSON.parse(e.key);
            e.posData = true;
            populate(e);
            e.posData = false;
            e.type = "sen_log";
            populate(e);
        }
    };
    inStream = progress(request.get({
        url: url,
        encoding: null,
        timeout: 30000
    })).on('progress', function(state) {
        console.log(JSON.stringify({
            url: url,
            percent: state.percent
        }));
    }).on('response', function(response) {
        if (response.statusCode === 200) {
            //TODO replace domain with something that can handle exceptions with context
            parser = spawn("java", ["-jar",
                    "-Xmx64m",
                    "java_parser/target/stats-0.1.0.jar"
                ], {
                //we may want to ignore stderr so the child doesn't stay open
                stdio: ['pipe', 'pipe', 'ignore'],
                encoding: 'utf8'
            });
            parseStream = ndjson.parse();
            if (url.slice(-3) === "bz2" && config.NODE_ENV !== "test") {
                bz = spawn("bunzip2");
                inStream.pipe(bz.stdin);
                bz.stdout.pipe(parser.stdin);
            }
            else {
                inStream.pipe(parser.stdin);
            }
            parser.stdout.pipe(parseStream);
            //parser.stderr.on('data', function(data) {
            //    console.log(data.toString());
            //});
            parseStream.on('data', handleStream);
            parseStream.on('end', exit);
        }
        else {
            exit(response.statusCode.toString());
        }
    });

    function exit(err) {
        err = err || error;
        if (!err) {
            parsed_data = utility.getParseSchema();
            var message = "time spent on post-processing match ";
            console.time(message);
            console.log("processing event buffer...");
            processEventBuffer();
            console.log("processing team fights...");
            processTeamfights();
            //console.log("processing multi-kill-streaks...");
            //processMultiKillStreaks();
            console.log("processing all players data");
            processAllPlayers();
            console.timeEnd(message);
        }
        return cb(err, parsed_data);
    }

    function handleStream(e) {
        if (streamTypes[e.type]) {
            streamTypes[e.type](e);
        }
        else if (types[e.type]) {
            entries.push(e);
        }
        else {
            //no event handler for this type, don't push it to event buffer
            console.log("no event handler for type %s", e.type);
        }
    }

    function processEventBuffer() {
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            //adjust time by zero value to get actual game time
            //we can only do this once we have a complete event buffer since the game start time (game_zero) is sent at some point in the stream
            e.time -= game_zero;
            types[e.type](e);
        }
    }

    function processAllPlayers() {
        //compute data that requires all parsed players
        //pick order, radiant advantage per minute
        for (var i = 0; i < parsed_data.players[0].times.length; i++) {
            var goldtotal = 0;
            var xptotal = 0;
            parsed_data.players.forEach(function(p, j) {
                //just use index to determine radiant/dire since parsed_data players is invariantly 10 players
                if (j < parsed_data.players.length / 2) {
                    goldtotal += p.gold_t[i];
                    xptotal += p.xp_t[i];
                }
                else {
                    xptotal -= p.xp_t[i];
                    goldtotal -= p.gold_t[i];
                }
            });
            parsed_data.radiant_gold_adv.push(goldtotal);
            parsed_data.radiant_xp_adv.push(xptotal);
        }
    }

    function processTeamfights() {
        //fights that didnt end wont be pushed to teamfights array (endgame case)
        //filter only fights where 3+ heroes died
        teamfights = teamfights.filter(function(tf) {
            return tf.deaths >= 3;
        });
        teamfights.forEach(function(tf) {
            tf.players.forEach(function(p, ind) {
                //record player's start/end xp for level change computation
                if (intervalState[tf.start] && intervalState[tf.end]) {
                    p.xp_start = intervalState[tf.start][ind].xp;
                    p.xp_end = intervalState[tf.end][ind].xp;
                }
            });
        });
        for (var i = 0; i < entries.length; i++) {
            //loop over entries again
            var e = entries[i];
            //check each teamfight to see if this event should be processed as part of that teamfight
            for (var j = 0; j < teamfights.length; j++) {
                var tf = teamfights[j];
                if (e.time >= tf.start && e.time <= tf.end) {
                    //kills_log tracks only hero kills on non-illusions
                    //we mutated the type in an earlier pass
                    if (e.type === "kills_log") {
                        //copy the entry
                        var e_cpy_1 = JSON.parse(JSON.stringify(e));
                        //count toward kills
                        e_cpy_1.type = "killed";
                        populate(e_cpy_1, tf);
                        //get slot of target
                        e.slot = hero_to_slot[e.key];
                        if (intervalState[e.time][e.slot]) {
                            //if a hero dies, add to deaths_pos, lookup slot of the killed hero by hero name (e.key), get position from intervalstate
                            var x = intervalState[e.time][e.slot].x;
                            var y = intervalState[e.time][e.slot].y;
                            //copy the entry
                            var e_cpy_2 = JSON.parse(JSON.stringify(e));
                            //fill in the copy
                            e_cpy_2.type = "deaths_pos";
                            e_cpy_2.key = [x, y];
                            e_cpy_2.posData = true;
                            populate(e_cpy_2, tf);
                            //increment death count for this hero
                            tf.players[e_cpy_2.slot].deaths += 1;
                        }
                    }
                    else if (e.type === "buyback_log") {
                        //bought back
                        if (tf.players[e.slot]) {
                            tf.players[e.slot].buybacks += 1;
                        }
                    }
                    else if (e.type === "damage") {
                        //sum damage
                        //check if damage dealt to hero and not illusion
                        if (e.key.indexOf("npc_dota_hero") !== -1 && !e.target_illusion) {
                            //check if the damage dealer could be assigned to a slot
                            if (tf.players[e.slot]) {
                                tf.players[e.slot].damage += e.value;
                            }
                        }
                    }
                    else if (e.type === "gold_reasons" || e.type === "xp_reasons") {
                        //add gold/xp to delta
                        if (tf.players[e.slot]) {
                            var types = {
                                "gold_reasons": "gold_delta",
                                "xp_reasons": "xp_delta"
                            };
                            tf.players[e.slot][types[e.type]] += e.value;
                        }
                    }
                    else if (e.type === "ability_uses" || e.type === "item_uses") {
                        //count skills, items
                        populate(e, tf);
                    }
                    else {
                        continue;
                    }
                }
            }
        }
        parsed_data.teamfights = teamfights;
    }
    // associate kill streaks with multi kills and team fights
    function processMultiKillStreaks() {
        // bookkeeping about each player
        var players = {};
        // for each entry in the combat log
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            // identify the killer
            var killer = entry.unit;
            var killer_index = hero_to_slot[killer];
            // if the killer is a hero (which it might not be)
            if (killer_index !== undefined) {
                // bookmark this player's parsed bookkeeping
                var parsed_info = parsed_data.players[killer_index];
                // if needed, initialize this player's bookkeeping
                if (players[killer_index] === undefined) {
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
                if (entry.type === "kills_log") {
                    // determine who was killed
                    var killed = entry.key;
                    var killed_index = hero_to_slot[killed];
                    // if this is a valid kill (note: self-denies (via bloodstone, etc) are logged
                    // as kill events but do not break kill streaks or multi kills events)
                    if (killer_index != killed_index) {
                        // check if we've run out of room in the current kills array (note: this
                        // would happen because (for some reason) the combat log does not contain
                        // kill streak events for streaks of size 2 (even though it really should))
                        var cur_streak_budget = local_info.cur_streak_budget;
                        if (cur_streak_length == cur_streak_budget && cur_streak_budget == 2) {
                            // remove the first element of the streak (note: later we will
                            // push a new second element on to the end of the streak)
                            parsed_info.kill_streaks_log[all_streak_length - 1].splice(0, 1);
                            cur_streak_length--;
                            // check if the current kill streak has ended
                        }
                        else if (cur_streak_length >= cur_streak_budget) {
                            // if so, create a new streak in the kills array
                            all_streak_length++;
                            cur_streak_length = 0;
                            parsed_info.kill_streaks_log.push([]);
                            local_info.cur_streak_budget = 2;
                            if (print_multi_kill_streak_debugging) {
                                console.log("\t%s kill streak has ended", killer);
                            }
                        }
                        // check if the current multi kill has ended
                        if (local_info.cur_multi_val < parsed_info.multi_kill_id_vals[local_info.cur_multi_id]) {
                            // if not, increment the current multi kill value
                            local_info.cur_multi_val++;
                        }
                        else {
                            // if so, create a new multi kill id and value
                            local_info.cur_multi_id++;
                            local_info.cur_multi_val = 1;
                            parsed_info.multi_kill_id_vals.push(1);
                            if (print_multi_kill_streak_debugging) {
                                console.log("\t%s multi kill has ended", killer);
                            }
                        }
                        // determine if this kill was part of a team fight
                        var team_fight_id = 0;
                        var kill_time = entry.time;
                        for (var j = 0; j < teamfights.length; j++) {
                            var teamfight = teamfights[j];
                            if (kill_time >= teamfight.start && kill_time <= teamfight.end) {
                                team_fight_id = j + 1;
                            }
                        }
                        // add this kill to the killer's list of kills
                        parsed_info.kill_streaks_log[all_streak_length - 1].push({
                            "hero_id": hero_to_id[killed],
                            "multi_kill_id": local_info.cur_multi_id,
                            "team_fight_id": team_fight_id,
                            "time": kill_time
                        });
                        if (print_multi_kill_streak_debugging) {
                            console.log("\t%s killed %s", killer, killed);
                        }
                    }
                    // if this entry is a notification of a multi kill (note: the kill that caused
                    // this multi kill has not been seen yet; it will one of the next few entries)
                }
                else if (entry.type === "multi_kills") {
                    // update the value of the current multi kill
                    parsed_info.multi_kill_id_vals[local_info.cur_multi_id] = parseInt(entry.key);
                    if (print_multi_kill_streak_debugging) {
                        console.log("\t%s got a multi kill of %s", killer, entry.key);
                    }
                    // if this entry is a notification of a kill streak (note: the kill that caused
                    // this kill streak has not been seen yet; it will one of the next few entries)
                }
                else if (entry.type === "kill_streaks") {
                    // update the value of the current kill streak
                    local_info.cur_streak_budget = parseInt(entry.key);
                    if (print_multi_kill_streak_debugging) {
                        console.log("\t%s got a kill streak of %s", killer, entry.key);
                    }
                }
            }
        }
        // remove small (length < 3) kill streaks
        for (var index in players) {
            var data = parsed_data.players[index].kill_streaks_log;
            var i = data.length;
            while (i--) {
                if (data[i].length < 3) {
                    data.splice(i, 1);
                }
            }
        }
    }
    //strips off "item_" from strings
    function translate(input) {
        if (input != null) {
            if (input.indexOf("item_") === 0) {
                input = input.slice(5);
            }
        }
        return input;
    }
    //prepends illusion_ to string if illusion
    function computeIllusionString(input, isIllusion) {
        return (isIllusion ? "illusion_" : "") + input;
    }

    function getSlot(e) {
        //with replay outputting sourceName and targetSourceName, merging/associating no longer necessary
        //e.unit should be populated with a valid hero for kill/damage
        //e.unit will be populated with the killed/damaged unit for killed/damaged (this may not be a hero, in that case e.slot will be undefined)
        //e.unit = assocName(e.unit);
        //if slot in event, use that, otherwise map value (could be undefined)
        //e.slot can be 0, so we check for existence in the object rather than !e.slot
        e.slot = ("slot" in e) ? e.slot : hero_to_slot[e.unit];
        populate(e);
    }

    function populate(e, container) {
        //use parsed_data by default if nothing passed in
        container = container || parsed_data;
        if (!container.players[e.slot]) {
            //couldn't associate with a player, probably attributed to a creep/tower/necro unit
            //console.log(e);
            return;
        }
        var t = container.players[e.slot][e.type];
        if (typeof t === "undefined") {
            //container.players[0] doesn't have a type for this event
            console.log("no field in parsed_data.players for %s", JSON.stringify(e));
            return;
        }
        else if (e.posData) {
            //fill 2d hash with x,y values
            var x = e.key[0];
            var y = e.key[1];
            if (!t[x]) {
                t[x] = {};
            }
            if (!t[x][y]) {
                t[x][y] = 0;
            }
            t[x][y] += 1;
        }
        else if (e.max) {
            //check if value is greater than what was stored
            if (e.value > t.value) {
                container.players[e.slot][e.type] = e;
            }
        }
        else if (t.constructor === Array) {
            //determine whether we want the value only (interval) or the time and key (log)
            //either way this creates a new value so e can be mutated later
            var arrEntry = (e.interval) ? e.value : {
                time: e.time,
                key: e.key
            };
            t.push(arrEntry);
            if (print_multi_kill_streak_debugging && e.type == "kills_log") {
                console.log("\t%s killed %s", e.unit, e.key);
            }
        }
        else if (typeof t === "object") {
            //add it to hash of counts
            e.value = e.value || 1;
            t[e.key] ? t[e.key] += e.value : t[e.key] = e.value;
            if (print_multi_kill_streak_debugging) {
                if (e.type == "kill_streaks") {
                    console.log("\t%s got a kill streak of %s", e.unit, e.key);
                }
                else if (e.type == "multi_kills") {
                    console.log("\t%s got a multi kill of %s", e.unit, e.key);
                }
            }
        }
        else if (typeof t === "string") {
            //string, used for steam id
            container.players[e.slot][e.type] = e.key;
        }
        else {
            //we must use the full reference since this is a primitive type
            //use the value most of the time, but key when stuns since value only holds Integers in Java
            //replace the value directly
            container.players[e.slot][e.type] = e.value || Number(e.key);
        }
    }
}
