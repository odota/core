var utility = require('../utility');
var constants = require('../constants');
var mergeObjects = utility.mergeObjects;
var db = require("../db");
var async = require('async');
//stats
/*
//parsed_data without version, these are v1 matches since we started versioning at 2
> db.matches.find({"parsed_data":{$exists:true}, "parsed_data.version":null}).explain()
{
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 12423,
        "nscannedObjects" : 5274692,
        "nscanned" : 5274692,
        "nscannedObjectsAllPlans" : 5274692,
        "nscannedAllPlans" : 5274692,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 343982,
        "nChunkSkips" : 0,
        "millis" : 1035388,
        "server" : "yasp-core-hm-2:27017",
        "filterSet" : false
}
> db.matches.find({"parsed_data.version":2}).explain()
{
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 2811,
        "nscannedObjects" : 5369397,
        "nscanned" : 5369397,
        "nscannedObjectsAllPlans" : 5369397,
        "nscannedAllPlans" : 5369397,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 334682,
        "nChunkSkips" : 0,
        "millis" : 1260866,
        "server" : "yasp-core-hm-2:27017",
        "filterSet" : false
}
> db.matches.find({"parsed_data.version":3}).explain()
{
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 9884,
        "nscannedObjects" : 5398809,
        "nscanned" : 5398809,
        "nscannedObjectsAllPlans" : 5398809,
        "nscannedAllPlans" : 5398809,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 382519,
        "nChunkSkips" : 0,
        "millis" : 988975,
        "server" : "yasp-core-hm-2:27017",
        "filterSet" : false
}
> db.matches.find({"parsed_data.version":4}).explain()
{
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 57240,
        "nscannedObjects" : 5406783,
        "nscanned" : 5406783,
        "nscannedObjectsAllPlans" : 5406783,
        "nscannedAllPlans" : 5406783,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 356328,
        "nChunkSkips" : 0,
        "millis" : 1008631,
        "server" : "yasp-core-hm-2:27017",
        "filterSet" : false
}
> db.matches.find({"parsed_data.version":5}).explain()
{
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 77982,
        "nscannedObjects" : 5413117,
        "nscanned" : 5413117,
        "nscannedObjectsAllPlans" : 5413117,
        "nscannedAllPlans" : 5413117,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 376859,
        "nChunkSkips" : 0,
        "millis" : 1000451,
        "server" : "yasp-core-hm-2:27017",
        "filterSet" : false
}
> db.matches.find({"parsed_data.version":6}).explain()
{
        "cursor" : "BasicCursor",
        "isMultiKey" : false,
        "n" : 21541,
        "nscannedObjects" : 5418010,
        "nscanned" : 5418010,
        "nscannedObjectsAllPlans" : 5418010,
        "nscannedAllPlans" : 5418010,
        "scanAndOrder" : false,
        "indexOnly" : false,
        "nYields" : 366490,
        "nChunkSkips" : 0,
        "millis" : 1016677,
        "server" : "yasp-core-hm-2:27017",
        "filterSet" : false
}
*/
//if deleting parsed_data, we should set parse_status to unavailable
//v1, delete parsed_data (parsed_data.players contains players with lh, gold, xp, not much else, no heroes object)
//db.matches.update({"parsed_data":{$exists:true}, "parsed_data.version":null},{$unset:{parsed_data:""},$set:{parse_status:1}},{multi:true})
db.matches.find({
    "parsed_data": {
        $ne: null
    },
    //run these after v7 code is deployed, one version at a time
    "parsed_data.version": 6
}, {
    limit: 0
}).each(function(match) {
    //delete _id
    delete match["_id"];
    //backfill steam_ids
    //iterate through match.players
    match.players.forEach(function(player, i) {
        //get parseSlot for each
        var parseSlot = player.player_slot % (128 - 5);
        var p = match.parsed_data.players[parseSlot];
        //compute steam64
        var steam64 = utility.convert32to64(player.account_id);
        //store as string under steam_id
        p.steam_id = steam64.toString();
    });
    //v2, migration
    if (match.parsed_data.version === 2) {
        v4(match);
    }
    //v3, migration
    if (match.parsed_data.version === 3) {
        v4(match);
    }
    //v4, migration
    if (match.parsed_data.version === 4) {
        v4(match);
    }
    //v5, migration
    else if (match.parsed_data.version === 5) {
        v6(match);
    }
    //v6, migration
    else if (match.parsed_data.version === 6) {
        v6(match);
    }
    else {
        console.log(match.parsed_data.version);
    }
    //persist the saved match to db
    db.matches.update({
        match_id: match.match_id
    }, {
        $set: match
    }, function(err) {
        console.log(match.match_id, err);
    });
}).error(function(err) {
    console.log(err);
    process.exit(1);
});

function v4(match) {
    //console.log("patching v2/v3/v4 data");
    //make a copy of heroes object so the migration is idempotent
    var orig_heroes = JSON.parse(JSON.stringify(match.parsed_data.heroes));
    mergeMatchData(match);
    for (var i = 0; i < match.players.length; i++) {
        var player = match.players[i];
        var parseSlot = player.player_slot % (128 - 5);
        var parsedPlayer = match.parsed_data.players[parseSlot];
        //get data from old heroes object
        var hero_obj = constants.heroes[player.hero_id];
        if (hero_obj && match.parsed_data.heroes) {
            var parsedHero = match.parsed_data.heroes[hero_obj.name];
            //get the data from the old heroes hash
            parsedPlayer.purchase = parsedHero.itembuys;
            parsedPlayer.buyback_log = parsedPlayer.buybacks;
            parsedPlayer.ability_uses = parsedHero.abilityuses;
            parsedPlayer.item_uses = parsedHero.itemuses;
            parsedPlayer.gold_reasons = parsedHero.gold_log;
            parsedPlayer.xp_reasons = parsedHero.xp_log;
            parsedPlayer.damage = parsedHero.damage;
            parsedPlayer.hero_hits = parsedHero.hero_hits;
            parsedPlayer.purchase_log = parsedHero.timeline;
            parsedPlayer.kills_log = parsedHero.herokills;
            parsedPlayer.kills = parsedHero.kills;
            parsedPlayer.times = match.parsed_data.times;
        }
    }
    //text is now stored under key
    if (match.parsed_data.chat) {
        match.parsed_data.chat.forEach(function(c) {
            c.key = c.text;
        });
    }
    //restore the original heroes object
    match.parsed_data.heroes = orig_heroes;
}

function v6(match) {
    //console.log("patching v5/v6 data");
    //build single chat from individual player chats
    match.parsed_data.chat = [];
    match.parsed_data.players.forEach(function(p, i) {
        p.chat.forEach(function(c) {
            c.slot = i;
            match.parsed_data.chat.push(c);
        });
    });
    //sort the chat messages by time
    match.parsed_data.chat.sort(function(a, b) {
        return a.time - b.time;
    });
}

function mergeMatchData(match) {
    var heroes = match.parsed_data.heroes;
    //loop through all units
    //look up corresponding hero_id
    //hero if can find in constants
    //find player slot associated with that unit(hero_to_slot)
    //merge into player's primary unit
    //if not hero attempt to associate with a hero
    for (var key in heroes) {
        var primary = getAssociatedHero(key, heroes);
        if (key !== primary) {
            //merge the objects into primary, but not with itself
            mergeObjects(heroes[primary], heroes[key]);
        }
    }
    return match;
}

function getAssociatedHero(unit, heroes) {
    //assume all illusions belong to that hero
    if (unit.slice(0, "illusion_".length) === "illusion_") {
        unit = unit.slice("illusion_".length);
    }
    //attempt to recover hero name from unit
    if (unit.slice(0, "npc_dota_".length) === "npc_dota_") {
        //split by _
        var split = unit.split("_");
        //get the third element
        var identifiers = [split[2], split[2] + "_" + split[3]];
        identifiers.forEach(function(id) {
            //append to npc_dota_hero_, see if matches
            var attempt = "npc_dota_hero_" + id;
            if (heroes[attempt]) {
                unit = attempt;
            }
        });
    }
    return unit;
}