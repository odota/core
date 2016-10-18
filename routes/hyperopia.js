const Chance = require('chance');
const express = require('express');
const matches = express.Router();
const constants = require('dotaconstants');
const matchPages = constants.match_pages;
const playerSlots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
const item_ids = Object.keys(constants.items);
const hero_ids = Object.keys(constants.heroes);

module.exports = function (db)
{
  matches.get('/:player_id/:match_id/:info?', (req, res, cb) => {
    console.time('hyperopia generate match');
    db.first('personaname')
            .from('players')
            .where({
              account_id: req.params.player_id,
            })
            .asCallback((err, p) => {
              if (err)
                {
                return cb(err);
              }

              const mChance = new Chance(req.params.player_id, req.params.match_id);

              const startTime = mChance.date();
              startTime.setFullYear(2017);

              const match = {};
              match.match_id = req.params.match_id;
              match.skill = mChance.weighted([null, 1, 2, 3], [0.1, 0.3, 0.3, 0.3]);
              match.radiant_win = mChance.bool();
              match.start_time = startTime.getTime() / 1000;
              match.duration = mChance.natural({ min: 15, max: 10000 });
              match.tower_status_dire = 0; // generateTowers(0, match.radiant_win);
              match.tower_status_radiant = 0; // generateTowers(1, match.radiant_win);
              match.tower_status_dire = 0;
              match.tower_status_radiant = 0;
              match.region = mChance.pickone(Object.keys(constants.region).splice(1));
              match.lobby_type = mChance.pickone(Object.keys(constants.lobby_type));
              match.leagueid = 0;
              match.game_mode = mChance.pickone(['1', '2', '3', '4', '5', '12', '13', '22']);
              match.picks_bans = null;
              match.parse_status = 0;
              match.chat = generateChat(mChance.natural({ max: 200 }));
              match.teamfights = [];
              match.objectives = [];
              match.version = 0;

              const times = [];
              let time = 0;
              while (time < match.duration) {
                times.push(time);
                time += 60;
              }

              match.players = generatePlayers();

              function generatePlayers() {
                const players = [];
                const heroes = mChance.pickset(hero_ids, 10);
                for (let i = 0; i < 10; i++) {
                  const player = {
                    account_id: i === (req.params.match_id % 10) ? req.params.player_id : null,
                    personaname: i === (req.params.match_id % 10) ? p.personaname : null,
                    player_slot: playerSlots[i],
                    hero_id: heroes[i],
                    kills: mChance.natural({ max: 100 }),
                    deaths: mChance.natural({ max: 100 }),
                    assists: mChance.natural({ max: 100 }),
                    leaver_status: 0,
                    total_gold: mChance.natural({ max: 50000 }),
                    last_hits: mChance.natural({ max: 1000 }),
                    denies: mChance.natural({ max: 100 }),
                    gold_per_min: mChance.natural({ min: 180, max: 1100 }),
                    xp_per_min: mChance.natural({ max: 100 }),
                    gold_spent: mChance.natural({ max: 200000 }),
                    hero_damage: mChance.natural({ max: 100000 }),
                    tower_damage: mChance.natural({ max: 16000 }),
                    hero_healing: mChance.natural({ max: 5000 }),
                    level: mChance.natural({ max: 25 }),
                    max_hero_hit: null,
                    times,
                    isRadiant: i < 5,
                  };

                  let gold = [],
                    lh = [],
                    xp = [];
                  let lastGold = 0,
                    lastLH = 0,
                    lastXP = 0;
                  for (var j = 0; j < times.length; j++) {
                    gold.push(lastGold);
                    lh.push(lastLH);
                    xp.push(lastXP);
                    lastGold = mChance.natural({ min: lastGold, max: 100000 });
                    lastLH = mChance.natural({ min: lastLH, max: player.last_hits });
                    lastXP = mChance.natural({ min: lastXP, max: 100000 });
                  }

                  player.gold_t = gold;
                  player.lh_t = lh;
                  player.xp_t = xp;

                  for (j = 0; j < mChance.weighted([0, 1, 2, 3, 4, 5, 6], [0.01, 0.04, 0.5, 0.1, 0.2, 0.3, 0.3]); j++) {
                    player[`item_${j}`] = constants.items[mChance.pickone(item_ids)].id;
                  }

                  player.obs_log = generateWards();
                  player.sen_log = generateWards();
                  player.purchase_log = generateItemTimeline();
                  player.kills_log = [];
                  player.buyback_log = [];
                  player.lane_pos = {};
                  player.obs = {};
                  player.sen = {};
                  player.actions = {};
                  player.pings = mChance.natural({ max: 1000 });
                  player.purchase = {};
                  player.gold_reasons = {};
                  player.xp_reasons = {};
                  player.killed = {};
                  player.item_uses = {};
                  player.ability_uses = {};
                  player.hero_hits = {};
                  player.damage = {};
                  player.damage_taken = {};
                  player.damage_inflictor = {};
                  player.runes = {};
                  player.killed_by = {};
                  player.kill_streaks = {};
                  player.multi_kills = {};
                  player.life_state = {};


                  players.push(player);
                }

                return players;
              }

              function generateItemTimeline()
                {
                const items = [];
                let lastTime = -60;
                for (let j = 0; j < mChance.natural({ max: 40 }); j++) {
                  lastTime = mChance.integer({ min: lastTime, max: match.duration });
                  items.push({
                    time: lastTime,
                    key: mChance.pickone(Object.keys(constants.items)),
                  });
                }
              }

              function generateWards() {
                const wards = [];
                for (let j = 0; j < mChance.natural({ max: 20 }); j++) {
                  wards.push({
                    time: mChance.natural({ max: match.duration }),
                    key: [
                      mChance.natural({ min: 64, max: 192 }),
                      mChance.natural({ min: 64, max: 192 }),
                    ],
                  });
                }

                return wards;
              }

              function generateChat(num) {
                const chat = [];
                let lastTime = 0;
                for (let i = 0; i < num; i++) {
                  lastTime = mChance.natural({ min: lastTime, max: match.duration });
                  chat.push({
                    time: lastTime,
                    slot: mChance.pickone(playerSlots),
                    key: mChance.bool() ? mChance.sentence({ words: mChance.natural({ max: 15 }) }) :
                                mChance.bool() ? mChance.word() : mChance.syllable(),
                  });
                }

                return chat;
              }

                // function generateTowers(side, radiantWin) {
                //    var status = radiantWin ?
                //        (side ? chance.natural({min: 1, max: 2}) : 0) :
                //        (side ? 0 : chance.naturla({min: 1, max: 2}));
                //
                //    status = status << 9;
                //    var top = chance.natural({min: 0, max: 7});
                //    var mid = top === 0 ? 0 :
                //        top > 6
                //    return status;
                // }
              console.log(match);
              const info = matchPages[req.params.info] ? req.params.info : 'index';
              res.render(`match/match_${info}`,
                {
                  route: info,
                  match,
                  player_id: req.params.player_id,
                  tabs: matchPages,
                  hyperopia: true,
                  display_types:
                  {
                    DOTA_UNIT_ORDER_MOVE_TO_POSITION: 'Move (P)',
                    DOTA_UNIT_ORDER_MOVE_TO_TARGET: 'Move (T)',
                    DOTA_UNIT_ORDER_ATTACK_MOVE: 'Attack (M)',
                    DOTA_UNIT_ORDER_ATTACK_TARGET: 'Attack (T)',
                    DOTA_UNIT_ORDER_CAST_POSITION: 'Cast (P)',
                    DOTA_UNIT_ORDER_CAST_TARGET: 'Cast (T)',
                            // "DOTA_UNIT_ORDER_CAST_TARGET_TREE"
                    DOTA_UNIT_ORDER_CAST_NO_TARGET: 'Cast (N)',
                            // "DOTA_UNIT_ORDER_CAST_TOGGLE"
                    DOTA_UNIT_ORDER_HOLD_POSITION: 'Hold',
                            // "DOTA_UNIT_ORDER_TRAIN_ABILITY",
                    DOTA_UNIT_ORDER_DROP_ITEM: 'Drop',
                    DOTA_UNIT_ORDER_GIVE_ITEM: 'Give',
                    DOTA_UNIT_ORDER_PICKUP_ITEM: 'Pickup',
                            // "DOTA_UNIT_ORDER_PICKUP_RUNE"
                            // "DOTA_UNIT_ORDER_PURCHASE_ITEM"
                            // "DOTA_UNIT_ORDER_SELL_ITEM"
                            // "DOTA_UNIT_ORDER_DISASSEMBLE_ITEM"
                            // "DOTA_UNIT_ORDER_MOVE_ITEM"
                            // "DOTA_UNIT_ORDER_CAST_TOGGLE_AUTO"
                            // "DOTA_UNIT_ORDER_STOP"
                    DOTA_UNIT_ORDER_TAUNT: 'Taunt',
                            // "DOTA_UNIT_ORDER_BUYBACK",
                    DOTA_UNIT_ORDER_GLYPH: 'Glyph',
                            // "DOTA_UNIT_ORDER_EJECT_ITEM_FROM_STASH"
                            // "DOTA_UNIT_ORDER_CAST_RUNE"
                    DOTA_UNIT_ORDER_PING_ABILITY: 'Pings (Ability)',
                            //"DOTA_UNIT_ORDER_MOVE_TO_DIRECTION": "Move (D)"
                  },
                  title: `Match ${match.match_id}`,
                });
            });
  });

  return matches;
};
