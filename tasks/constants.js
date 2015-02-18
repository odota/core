var async = require('async');
var utility = require('../utility');
var getData = utility.getData;
var fs = require('fs');

module.exports = function generateConstants(outputFile, done) {
    var fileName = './constants.json';
    if (typeof outputFile === "string") {
        fileName = outputFile;
    }
    else {
        done = outputFile;
    }
    var constants = require('../sources.json');
    async.map(Object.keys(constants.sources), function (key, cb) {
        var val = constants.sources[key];
        getData(val, function (err, result) {
            constants[key] = result;
            cb(err);
        });
    }, function (err) {
        if (err) {
            return done(err);
        }
        var heroes = constants.heroes;
        //key heroes by name
        constants.hero_names = {};
        for (var key in heroes) {
            constants.hero_names[heroes[key].name] = heroes[key];
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
        constants.lanes = [];
        for (var i = 0; i < 128; i++) {
            constants.lanes.push([]);
            for (var j = 0; j < 128; j++) {
                var lane;
                if (Math.abs(i - (127 - j)) < 10) {
                    lane = 1;
                }
                else if (j < 27 || i < 27) {
                    lane = 2;
                }
                else if (j >= 100 || i >= 100) {
                    lane = 0;
                }
                else if (i < 45) {
                    lane = 4;
                }
                else if (i >= 82) {
                    lane = 3;
                }
                else {
                    lane = 1;
                }
                constants.lanes[i].push(lane);
            }
        }
        fs.writeFile(fileName, JSON.stringify(constants, null, 2), function (err) {
            if (!err) {
                console.log("[CONSTANTS] generated constants file");
            }
            return done(err);
        });
    });
};