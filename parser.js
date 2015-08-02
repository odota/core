var config = require('./config');
var express = require('express');
var request = require('request');
var fs = require('fs');
var cp = require('child_process');
var utility = require('./utility');
var domain = require('domain');
var ndjson = require('ndjson');
var spawn = cp.spawn;
var exec = cp.exec;
var bodyParser = require('body-parser');
var progress = require('request-progress');
var constants = require('./constants.json');
var app = express();
var capacity = require('os').cpus().length;
var cluster = require('cluster');
var port = config.PARSER_PORT || config.PORT;
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
    app.use(bodyParser.json());
    app.post('/deploy', function(req, res) {
        var err;
        //TODO verify the POST is from github/secret holder
        if (req.body.ref === "refs/heads/master") {
            console.log(req.body);
            //run the deployment command
            exec('npm run deploy-parser', function(error, stdout, stderr) {
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
                if (error) {
                    console.log('exec error: ' + error);
                }
                process.exit(0);
            });
        }
        else {
            err = "not passing deploy conditions";
        }
        res.json({
            error: err
        });
    });
    app.get('/', function(req, res, next) {
        if (!req.query.fileName && !req.query.url) {
            return res.json({
                capacity: capacity
            });
        }
        runParse(req.query, function(err, parsed_data) {
            if (err) {
                return res.json({
                    error: err
                });
            }
            if (err && config.NODE_ENV !== "test") {
                throw err;
            }
            return res.json(parsed_data);
        });
    });
    var server = app.listen(port, function() {
        var host = server.address().address;
        console.log('[PARSER] listening at http://%s:%s', host, port);
    });
}

function runParse(data, cb) {
    var print_multi_kill_streak_debugging = false;
    var fileName = data.fileName;
    var url = data.url;
    var error = "incomplete";
    var inStream;
    var parseStream;
    var bz;
    var parser;
    var d = domain.create();
    //parse state
    var entries = [];
    var name_to_slot = {};
    var hero_to_slot = {};
    var hero_to_id = {};
    var game_zero = 0;
    var curr_teamfight;
    var teamfights = [];
    var intervalState = {};
    var teamfight_cooldown = 15;
    var parsed_data;
    d.run(function() {
        //set up pipe chain
        parser = spawn("java", ["-jar",
        "-Xmx64m",
        "parser/target/stats-0.1.0.jar"
    ], {
            //we may want to ignore stderr if we're not dumping it to /dev/null from java already
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8'
        });
        parseStream = ndjson.parse();
        if (fileName) {
            inStream = fs.createReadStream(fileName);
            inStream.pipe(parser.stdin);
        }
        else if (url) {
            bz = spawn("bunzip2");
            inStream = progress(request.get({
                url: url,
                encoding: null,
                timeout: 30000
            })).on('progress', function(state) {
                parseStream.write(JSON.stringify({
                    "type": "progress",
                    "key": state.percent
                }) + "\n");
            }).on('response', function(response) {
                if (response.statusCode !== 200) {
                    parseStream.write(JSON.stringify({
                        "type": "error",
                        "key": response.statusCode
                    }) + "\n");
                }
            });
            inStream.pipe(bz.stdin);
            bz.stdout.pipe(parser.stdin);
        }
        parser.stdout.pipe(parseStream);
        parser.stderr.on('data', function(data) {
            console.log(data.toString());
        });
        parseStream.on('data', handleStream);
        parseStream.on('end', function() {
            exit(error);
        });
    });
    d.on('error', function(err) {
        exit(err);
    });
    //capture events streamed from parser and set up state for post-processing
    //these events are generally not pushed to event buffer (except hero_log)
    var streamTypes = {
        "state": function(e) {
            if (e.key === "PLAYING") {
                game_zero = e.time;
            }
            //console.log(e);
        },
        "hero_log": function(e) {
            //get hero name by id
            var h = constants.heroes[e.key];
            hero_to_slot[h ? h.name : e.key] = e.slot;
            //get hero id by name
            hero_to_id[h ? h.name : e.key] = e.key;
            //push it to entries for hero log
            entries.push(e);
        },
        "name": function(e) {
            name_to_slot[e.key] = e.slot;
        },
        "error": function(e) {
            error = "parse error: " + e.key;
        },
        "progress": function(e) {
            //job.progress(e.key, 100);
            //TODO we could output this as line delimited json
            console.log(e);
        },
        "epilogue": function() {
            error = null;
        }
    };
    var types = {
        "match_id": function(e) {
            parsed_data.match_id = e.value;
        },
        "steam_id": function(e) {
            populate(e);
        },
        "hero_log": function(e) {
            populate(e);
        },
        "gold_reasons": function(e) {
            if (!constants.gold_reasons[e.key]) {
                //new gold reason
                //reason 8=cheat?  shouldn't occur in pub games
                console.log(e);
            }
            getSlot(e);
        },
        "xp_reasons": function(e) {
            if (!constants.xp_reasons[e.key]) {
                //new xp reason
                console.log(e);
            }
            getSlot(e);
        },
        "purchase": function(e) {
            getSlot(e);
            if (e.key.indexOf("recipe_") === -1) {
                //don't include recipes in purchase logs
                e.type = "purchase_log";
                populate(e);
            }
        },
        "modifier_applied": getSlot,
        "modifier_lost": getSlot,
        "healing": getSlot,
        "ability_trigger": getSlot,
        "item_uses": getSlot,
        "ability_uses": getSlot,
        "kill_streaks": getSlot,
        "multi_kills": getSlot,
        "clicks": function(e) {
            //just 0 (other) the key for now since we dont know what the order_types are
            e.key = 0;
            getSlot(e);
        },
        "pings": function(e) {
            //we're not breaking pings into subtypes atm so just set key to 0 for now
            e.key = 0;
            getSlot(e);
        },
        "chat_event": function(e) {
            if (e.subtype === "CHAT_MESSAGE_RUNE_PICKUP") {
                //player
                e.type = "runes";
                populate(e);
            }
            else if (e.subtype === "CHAT_MESSAGE_RUNE_BOTTLE") {
                //player, bottled rune
            }
            else if (e.subtype === "CHAT_MESSAGE_HERO_KILL") {
                //player, assisting players
            }
            else if (e.subtype === "CHAT_MESSAGE_GLYPH_USED") {
                //team glyph
            }
            else if (e.subtype === "CHAT_MESSAGE_PAUSED") {
                //player paused
            }
            else if (e.subtype === "CHAT_MESSAGE_FIRSTBLOOD" || e.subtype === "CHAT_MESSAGE_TOWER_DENY" || e.subtype === "CHAT_MESSAGE_TOWER_KILL" || e.subtype === "CHAT_MESSAGE_BARRACKS_KILL" || e.subtype === "CHAT_MESSAGE_AEGIS" || e.subtype === "CHAT_MESSAGE_AEGIS_STOLEN" || e.subtype === "CHAT_MESSAGE_ROSHAN_KILL") {
                //tower (player/team)
                //barracks (player)
                //aegis (player)
                //roshan (team)
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            }
            else {
                console.log(e);
            }
        },
        "kills": function(e) {
            /*
            //log objectives via combat log
            var logs = ["_tower", "_rax", "_fort", "_roshan"];
            var isObjective = logs.some(function(s) {
                return (e.key.indexOf(s) !== -1 && !e.target_illusion);
            });
            if (isObjective) {
                //push a copy to objectives
                parsed_data.objectives.push(JSON.parse(JSON.stringify(e)));
            }
            */
            //count kill by this unit
            getSlot(e);
            if (e.target_hero && !e.target_illusion) {
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
                            kills: {},
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
        "damage": function(e) {
            //count damage dealt to unit
            getSlot(e);
            //check if this damage happened to a real hero
            if (e.target_hero && !e.target_illusion) {
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
                    key: e.inflictor,
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
                        key: e.inflictor,
                        value: e.value
                    };
                    getSlot(inf);
                    //biggest hit on a hero
                    var m = {
                        type: "max_hero_hit",
                        time: e.time,
                        max: true,
                        inflictor: e.inflictor,
                        unit: e.unit,
                        key: e.key,
                        value: e.value
                    };
                    getSlot(m);
                }
            }
        },
        "buyback_log": getSlot,
        "chat": function getChatSlot(e) {
            e.slot = name_to_slot[e.unit];
            //push a copy to chat
            parsed_data.chat.push(JSON.parse(JSON.stringify(e)));
        },
        "stuns": populate,
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
            if (e.time >= 0) {
                //if on minute, add to lh/gold/xp
                if (e.time % 60 === 0) {
                    e.interval = true;
                    e.type = "times";
                    e.value = e.time;
                    populate(e);
                    e.type = "gold";
                    e.value = e.gold;
                    populate(e);
                    e.type = "xp";
                    e.value = e.xp;
                    populate(e);
                    e.type = "lh";
                    e.value = e.lh;
                    populate(e);
                }
                e.interval = false;
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

    function exit(err) {
        if (err) {
            console.log(err.stack);
        }
        else {
            parsed_data = utility.getParseSchema();
            var message = "time spent on post-processing match ";
            console.time(message);
            console.log("processing event buffer...");
            processEventBuffer();
            console.log("processing team fights...");
            processTeamfights();
            console.log("processing multi-kill-streaks...");
            processMultiKillStreaks();
            console.log("processing all players data");
            processAllPlayers();
            console.timeEnd(message);
            //if (process.env.NODE_ENV !== "production") fs.writeFileSync("./output_parsed_data.json", JSON.stringify(parsed_data));
            if (print_multi_kill_streak_debugging) {
                fs.writeFileSync("./output_parsed_data.json", JSON.stringify(parsed_data));
            }
        }
        return cb(err ? (err.message || err.code || err) : null, parsed_data);
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
            //we can only do this once we have a complete event buffer since the game start time is sent at some point in the stream
            e.time -= game_zero;
            types[e.type](e);
        }
    }

    function processAllPlayers() {
        //compute data that requires all parsed players
        //pick order, radiant advantage per minute
        //determine pick order based on last time value of hero_log
        //determine a pick_time for each parsed player
        //duplicate, sort
        //create hash of indices by iterating through sorted array and mapping original index to order
        //insert back into originals, indexing by player slot
        var pick_map = {};
        for (var i = 0; i < parsed_data.players[0].times.length; i++) {
            var goldtotal = 0;
            var xptotal = 0;
            parsed_data.players.forEach(function(p, j) {
                //just use index to determine radiant/dire since parsed_data players is invariantly 10 players
                if (j < 5) {
                    goldtotal += p.gold[i];
                    xptotal += p.xp[i];
                }
                else {
                    xptotal -= p.xp[i];
                    goldtotal -= p.gold[i];
                }
                p.origIndex = j;
                p.pick_time = p.hero_log.length ? p.hero_log[p.hero_log.length - 1].time : Number.MAX_VALUE;
            });
            parsed_data.radiant_gold_adv.push(goldtotal);
            parsed_data.radiant_xp_adv.push(xptotal);
        }
        var sorted = parsed_data.players.slice().sort(function(a, b) {
            return a.pick_time - b.pick_time;
        });
        sorted.forEach(function(player, i) {
            pick_map[player.origIndex] = i + 1;
        });
        parsed_data.players.forEach(function(player) {
            player.pick_order = pick_map[player.origIndex];
        });
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
                        e_cpy_1.type = "kills";
                        populate(e_cpy_1, tf);
                        //get slot of target
                        e.slot = hero_to_slot[e.key];
                        //0 is valid value, so check for undefined
                        if (e.slot !== undefined) {
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
                        tf.players[e.slot].buybacks += 1;
                    }
                    else if (e.type === "damage") {
                        //sum damage
                        //check if damage dealt to hero and not illusion
                        if (e.key.indexOf("npc_dota_hero") !== -1 && !e.target_illusion) {
                            //check if the damage dealer could be assigned to a slot
                            if (e.slot !== undefined) {
                                tf.players[e.slot].damage += e.value;
                            }
                        }
                    }
                    else if (e.type === "gold_reasons" || e.type === "xp_reasons") {
                        //add gold/xp to delta
                        if (e.slot !== undefined) {
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
                // record which hero this is
                parsed_info.hero_id = hero_to_id[killer];
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
            //parsed_data.players[0] doesn't have a type for this event
            console.log(e);
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