var async = require('async');
var utility = require('../utility');
var getData = utility.getData;
var fs = require('fs');
module.exports = function generateConstants(done, outputFile) {
    var constants = require('../sources.json');
    async.map(Object.keys(constants.sources), function(key, cb) {
        var val = constants.sources[key];
        getData(val, function(err, result) {
            constants[key] = result;
            cb(err);
        });
    }, function(err) {
        if (err) {
            return done(err);
        }
        var heroes = constants.heroes;
        var alpha_heroes = [];
        //key heroes by name
        constants.hero_names = {};
        for (var key in heroes) {
            constants.hero_names[heroes[key].name] = heroes[key];
            alpha_heroes.push(heroes[key]);
        }
        alpha_heroes.sort(function(a, b) {
            return a.localized_name.localeCompare(b.localized_name);
        });
        constants.alpha_heroes = alpha_heroes;
        var items = constants.items.itemdata;
        constants.item_ids = {};
        for (var key in items) {
            constants.item_ids[items[key].id] = key;
            items[key].img = "http://cdn.dota2.com/apps/dota2/images/items/" + items[key].img;
        }
        constants.items = items;
        //significant items
        constants.big_items = {};
        for (var key in items) {
            if (items[key].cost > 1400) {
                constants.big_items[key] = items[key];
            }
        }
        var abilities = constants.abilities.abilitydata;
        for (var key2 in abilities) {
            abilities[key2].img = "http://cdn.dota2.com/apps/dota2/images/abilities/" + key2 + "_md.png";
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
        fs.writeFile(outputFile || './constants.json', JSON.stringify(constants, null, 2), function(err) {
            if (!err) {
                console.log("[CONSTANTS] generated constants file");
            }
            return done(err);
        });
    });
};