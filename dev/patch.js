const utility = require('../utility');
const constants = require('dotaconstants');
const mergeObjects = utility.mergeObjects;
const db = require('../db');
const async = require('async');
const version = Number(process.argv[2]);
// if deleting parsed_data, we should set parse_status to unavailable
// v1, delete parsed_data (parsed_data.players contains players with lh, gold, xp, not much else, no heroes object)
// db.matches.update({"parsed_data":{$exists:true}, "parsed_data.version":null},{$unset:{parsed_data:""},$set:{parse_status:1}},{multi:true})
db.matches.find({
  'parsed_data': {
    $ne: null,
  },
    // run these after v7 code is deployed, one version at a time
  'parsed_data.version': version,
}, {
  limit: 0,
}).each((match) => {
    // delete _id
  delete match._id;
    // backfill steam_ids
    // iterate through match.players
  match.players.forEach((player, i) => {
        // get parseSlot for each
    const parseSlot = player.player_slot % (128 - 5);
    const p = match.parsed_data.players[parseSlot];
        // compute steam64
    const steam64 = utility.convert32to64(player.account_id);
        // store as string under steam_id
    p.steam_id = steam64.toString();
  });
    // v2, migration
  if (match.parsed_data.version === 2) {
    v4(match);
  }
    // v3, migration
  if (match.parsed_data.version === 3) {
    v4(match);
  }
    // v4, migration
  if (match.parsed_data.version === 4) {
    v4(match);
  }
    // v5, migration
  else if (match.parsed_data.version === 5) {
    v6(match);
  }
    // v6, migration
  else if (match.parsed_data.version === 6) {
    v6(match);
  }
  else {
    console.log('found version %s', match.parsed_data.version);
  }
    // persist the saved match to db
  db.matches.update({
    match_id: match.match_id,
  }, {
    $set: match,
  }, (err) => {
    console.log(match.match_id, err);
  });
}).error((err) => {
  console.log(err);
  process.exit(1);
}).success(() => {
  console.log('done!');
});

function v4(match) {
    // console.log("patching v2/v3/v4 data");
    // make a copy of heroes object so the migration is idempotent
  const orig_heroes = JSON.parse(JSON.stringify(match.parsed_data.heroes));
  mergeMatchData(match);
  for (let i = 0; i < match.players.length; i++) {
    const player = match.players[i];
    const parseSlot = player.player_slot % (128 - 5);
    const parsedPlayer = match.parsed_data.players[parseSlot];
        // get data from old heroes object
    const hero_obj = constants.heroes[player.hero_id];
    if (hero_obj && match.parsed_data.heroes) {
      const parsedHero = match.parsed_data.heroes[hero_obj.name];
            // get the data from the old heroes hash
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
    // text is now stored under key
  if (match.parsed_data.chat) {
    match.parsed_data.chat.forEach((c) => {
      c.key = c.text;
    });
  }
    // restore the original heroes object
  match.parsed_data.heroes = orig_heroes;
}

function v6(match) {
    // console.log("patching v5/v6 data");
    // build single chat from individual player chats
  match.parsed_data.chat = [];
  match.parsed_data.players.forEach((p, i) => {
    p.chat.forEach((c) => {
      c.slot = i;
      match.parsed_data.chat.push(c);
    });
  });
    // sort the chat messages by time
  match.parsed_data.chat.sort((a, b) => {
    return a.time - b.time;
  });
}

function mergeMatchData(match) {
  const heroes = match.parsed_data.heroes;
    // loop through all units
    // look up corresponding hero_id
    // hero if can find in constants
    // find player slot associated with that unit(hero_to_slot)
    // merge into player's primary unit
    // if not hero attempt to associate with a hero
  for (const key in heroes) {
    const primary = getAssociatedHero(key, heroes);
    if (key !== primary) {
            // merge the objects into primary, but not with itself
      mergeObjects(heroes[primary], heroes[key]);
    }
  }
  return match;
}

function getAssociatedHero(unit, heroes) {
    // assume all illusions belong to that hero
  if (unit.slice(0, 'illusion_'.length) === 'illusion_') {
    unit = unit.slice('illusion_'.length);
  }
    // attempt to recover hero name from unit
  if (unit.slice(0, 'npc_dota_'.length) === 'npc_dota_') {
        // split by _
    const split = unit.split('_');
        // get the third element
    const identifiers = [split[2], split[2] + '_' + split[3]];
    identifiers.forEach((id) => {
            // append to npc_dota_hero_, see if matches
      const attempt = 'npc_dota_hero_' + id;
      if (heroes[attempt]) {
        unit = attempt;
      }
    });
  }
  return unit;
}
