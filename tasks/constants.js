var async = require('async');
var utility = require('../utility');
var getData = utility.getData;
var fs = require('fs');

module.exports = function generateConstants(done, fileName) {
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
        //key heroes by name
        constants.hero_names = {};
        for (var i = 0; i < heroes.length; i++) {
            constants.hero_names[heroes[i].name] = heroes[i];
        }
        var items = constants.items.itemdata;
        constants.item_ids = {};
        for (var key in items) {
            constants.item_ids[items[key].id] = key;
            items[key].img = "http://cdn.dota2.com/apps/dota2/images/items/" + items[key].img;
        }
        constants.items = items;
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
        fs.writeFile(fileName || './constants.json', JSON.stringify(constants, null, 2), function(err) {
            if (!err) {
                console.log("[CONSTANTS] generated constants file");
            }
            return done(err);
        });
    });
}