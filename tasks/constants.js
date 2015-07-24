//var r = require('../redis');
//var redis = r.client;
var utility = require('../utility');
var getData = utility.getData;
var async = require('async');
var fs = require('fs');
module.exports = function constants(cb) {
    var urls = {
        "items": "http://www.dota2.com/jsfeed/itemdata?l=english",
        "abilities": "http://www.dota2.com/jsfeed/abilitydata?l=english",
        /*
        "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
        "herodata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
        //these require an API key!
        "heroes": utility.generateJob("api_heroes", {
            language: "en-us"
        }).url,
        "leagues": utility.generateJob("api_leagues").url
        */
    };
    var constants = require('../sources.json');
    async.each(Object.keys(urls), function(key, cb) {
        var val = urls[key];
        //grab raw data from each url and place under that key
        getData(val, function(err, result) {
            constants[key] = result;
            cb(err);
        });
    }, function(err) {
        if (err) {
            return cb(err);
        }
        var heroes = JSON.parse(JSON.stringify(constants.heroes.result.heroes));
        heroes.sort(function(a, b) {
            return a.localized_name.localeCompare(b.localized_name);
        });
        constants.alpha_heroes = heroes;
        //key heroes by id
        constants.heroes = {};
        //key heroes by name
        constants.hero_names = {};
        heroes.forEach(function(h) {
            h.img = "http://cdn.dota2.com/apps/dota2/images/heroes/" + h.name.replace("npc_dota_hero_", "") + "_sb.png";
            constants.heroes[h.id] = h;
            constants.hero_names[h.name] = h;
        });
        /*
        //leagues, key by id
        var leagues = JSON.parse(JSON.stringify(constants.leagues.result.leagues));
        constants.leagues = {};
        leagues.forEach(function(l) {
            l.name = l.name.replace("#DOTA_Item_", "").split("_").join(" ");
            constants.leagues[l.leagueid] = l;
        });
        */
        //items, already keyed by name
        var items = constants.items.itemdata;
        constants.item_ids = {};
        var key;
        for (key in items) {
            constants.item_ids[items[key].id] = key;
            items[key].img = "http://cdn.dota2.com/apps/dota2/images/items/" + items[key].img;
        }
        constants.items = items;
        // add cmb, costDiv to items similar to cmb in abilities
        for (key in items) {
            var mcImg = '<img alt="Mana Cost" title="Mana Cost" class="manaImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/mana.png" width="16" height="16" border="0" />';
            var cdImg = '<img alt="Cooldown" title="Cooldown" class="cooldownImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/cooldown.png" width="16" height="16" border="0" />';
            var goldImg = '<img alt="Gold Cost" title="Gold Cost" class="goldImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/gold.png" width="16" height="16" border="0" />';
            var mcDiv = items[key].mc ? '<div>'+ mcImg + '<span> ' + items[key].mc + '</span>' + '</div>' : '';
            var cdDiv = items[key].cd ? '<div>'+ cdImg + '<span> ' + items[key].cd + '</span>' + '</div>' : '';
            constants.items[key].costDiv = '<div>' + goldImg + '<span> ' + items[key].cost + '</span>' + '</div>';
            constants.items[key].cmb = mcDiv + cdDiv;
        }
        //abilities, already keyed by name
        var abilities = constants.abilities.abilitydata;
        for (key in abilities) {
            abilities[key].img = "http://cdn.dota2.com/apps/dota2/images/abilities/" + key + "_md.png";
        }
        abilities.nevermore_shadowraze2 = abilities.nevermore_shadowraze1;
        abilities.nevermore_shadowraze3 = abilities.nevermore_shadowraze1;
        abilities.stats = {
            dname: "Stats",
            img: '../../public/images/Stats.png',
            attrib: "+2 All Attributes"
        };
        constants.abilities = abilities;
        constants.lanes = [];
        for (var i = 0; i < 128; i++) {
            constants.lanes.push([]);
            for (var j = 0; j < 128; j++) {
                var lane;
                if (Math.abs(i - (127 - j)) < 8) {
                    lane = 2; //mid
                }
                else if (j < 27 || i < 27) {
                    lane = 3; //top
                }
                else if (j >= 100 || i >= 100) {
                    lane = 1; //bot
                }
                else if (i < 50) {
                    lane = 5; //djung
                }
                else if (i >= 77) {
                    lane = 4; //rjung
                }
                else {
                    lane = 2; //mid
                }
                constants.lanes[i].push(lane);
            }
        }
        fs.writeFile('./constants.json', JSON.stringify(constants, null, 2), function(err) {
            if (!err) {
                console.log("[CONSTANTS] generated constants file");
            }
            return cb(err);
        });
    });
};
