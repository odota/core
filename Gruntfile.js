module.exports = function(grunt) {
  grunt.initConfig({
    jshint: {
      all: ['*.js']
    },
    shell: {
      target: {
        command: 'mvn -q -f parser/pom.xml package'
      }
    },
    mochaTest: {
      test: {
        options: {
          reporter: 'spec',
        },
        src: ['test/test.js']
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-shell');
  grunt.loadNpmTasks('grunt-mocha-test');

  grunt.registerTask('constants', function() {
    var done = this.async();
    updateConstants(done);
  });
  grunt.registerTask('fullhistory', function() {
    var done = this.async();
    getFullMatchHistory(done);
  });
  grunt.registerTask('unparsed', function() {
    var done = this.async();
    unparsed(done);
  });
  grunt.registerTask('default', ['shell', 'mochaTest']);

  var dotenv = require('dotenv');
  dotenv.load();
  var request = require('request');
  var cheerio = require('cheerio');
  var fs = require('fs');
  var async = require('async');
  var utility = require('./utility');

  function unparsed(done) {
    utility.matches.find({
      parse_status: 0
    }, function(err, docs) {
      docs.forEach(function(match) {
        console.log(match.match_id);
        utility.queueReq("parse", match);
      });
      done();
    });
  }

  function updateConstants(done) {
    var constants = require('./constants.json');
    async.map(Object.keys(constants.sources), function(key, cb) {
      var val = constants.sources[key];
      val = val.slice(-4) === "key=" ? val + process.env.STEAM_API_KEY : val;
      console.log(val);
      utility.getData(val, function(err, result) {
        constants[key] = result;
        cb(err);
      });
    }, function(err) {
      if (err) throw err;
      var heroes = constants.heroes.result.heroes;
      heroes.forEach(function(hero) {
        hero.img = "http://cdn.dota2.com/apps/dota2/images/heroes/" + hero.name.replace("npc_dota_hero_", "") + "_sb.png";
      });
      constants.heroes = buildLookup(heroes);
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
      var lookup = {};
      var ability_ids = constants.ability_ids.abilities;
      for (var j = 0; j < ability_ids.length; j++) {
        lookup[ability_ids[j].id] = ability_ids[j].name;
      }
      constants.ability_ids = lookup;
      constants.ability_ids["5601"] = "techies_suicide";
      constants.ability_ids["5088"] = "skeleton_king_mortal_strike";
      constants.ability_ids["5060"] = "nevermore_shadowraze1";
      constants.ability_ids["5061"] = "nevermore_shadowraze1";
      constants.ability_ids["5580"] = "beastmaster_call_of_the_wild";
      constants.ability_ids["5637"] = "oracle_fortunes_end";
      constants.ability_ids["5638"] = "oracle_fates_edict";
      constants.ability_ids["5639"] = "oracle_purifying_flames";
      constants.ability_ids["5640"] = "oracle_false_promise";
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
      lookup = {};
      var regions = constants.regions.regions;
      for (var k = 0; k < regions.length; k++) {
        lookup[regions[k].id] = regions[k].name;
      }
      constants.regions = lookup;
      constants.regions["251"] = "Peru";
      constants.regions["261"] = "India";
      console.log("[CONSTANTS] generated constants file");
      fs.writeFileSync("constants.json", JSON.stringify(constants, null, 2));
      done();
    });
  }

  function buildLookup(array) {
    var lookup = {};
    for (var i = 0; i < array.length; i++) {
      lookup[array[i].id] = array[i];
    }
    return lookup;
  }

  function getFullMatchHistory(done) {
    var remote = "http://dotabuff.com";
    var match_ids = {};
    //get full match history ONLY for specific players
    //build hash of match ids to request details for
    //todo add option to use steamapi via specific player history and specific hero id (up to 500 games per hero)
    var docs = [{
      account_id: 88367253
    }];
    async.mapSeries(docs, remoteRecursive, function(err) {
      //done with all players
      for (var key in match_ids) {
        var match = {};
        match.match_id = key;
        console.log(match);
        //utility.requestDetails(match);
      }
      done();
    });

    function getMatchPage(url, cb) {
      request({
        url: url,
        headers: {
          'User-Agent': 'request'
        }
      }, function(err, resp, body) {
        if (err || resp.statusCode !== 200) {
          return setTimeout(function() {
            getMatchPage(url, cb);
          }, 1000);
        }
        console.log("[REMOTE] %s", url);
        var parsedHTML = cheerio.load(body);
        var matchCells = parsedHTML('td[class=cell-xlarge]');
        matchCells.each(function(i, matchCell) {
          var match_url = remote + cheerio(matchCell).children().first().attr('href');
          var match_id = Number(match_url.split(/[/]+/).pop());
          match_ids[match_id] = 1;
        });
        var nextPath = parsedHTML('a[rel=next]').first().attr('href');
        if (nextPath) {
          getMatchPage(remote + nextPath, cb);
        }
        else {
          cb(null);
        }
      });
    }

    function remoteRecursive(player, cb) {
      var account_id = player.account_id;
      var player_url = remote + "/players/" + account_id + "/matches";
      getMatchPage(player_url, function(err) {
        cb(err);
      });
    }
  }

};
