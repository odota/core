CREATE TABLE matches
  PRIMARY KEY match_id
  radiant_win
  start_time
  "match_id": 1811211219,
  "radiant_win": true,
  "duration": 1782,
  "start_time": 1442906377,
  "match_seq_num": 1607941091,
  "tower_status_radiant": 1983,
  "tower_status_dire": 260,
  "barracks_status_radiant": 63,
  "barracks_status_dire": 51,
  "cluster": 123,
  "first_blood_time": 13,
  "lobby_type": 0,
  "human_players": 10,
  "leagueid": 0,
  "positive_votes": 0,
  "negative_votes": 0,
  "game_mode": 4,
  "engine": 1,
  radiant_team_name
  dire_team_name
  --from skill api
  "skill": 1
  --parsed data
  "parse_status": 3,
  chat
  objectives
  radiant_gold_adv
  radiant_xp_adv
  "teamfights": []
  "version": 13


CREATE TABLE players
  PRIMARY KEY account_id
    "account_id" : 100344929,
    "avatar" : "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/88/883f2697f5b2dc4affda2d47eedc1cbec8cfb657.jpg",
    "avatarfull" : "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/88/883f2697f5b2dc4affda2d47eedc1cbec8cfb657_full.jpg",
    "avatarmedium" : "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/88/883f2697f5b2dc4affda2d47eedc1cbec8cfb657_medium.jpg",
    "communityvisibilitystate" : 3,
    "lastlogoff" : 1426020853,
    "loccityid" : 44807,
    "loccountrycode" : "TR",
    "locstatecode" : "16",
    "personaname" : "Floki",
    "personastate" : 0,
    "personastateflags" : 0,
    "primaryclanid" : "103582791433775490",
    "profilestate" : 1,
    "profileurl" : "http://steamcommunity.com/profiles/76561198060610657/",
    "realname" : "Alper",
    "steamid" : "76561198060610657",
    "timecreated" : 1332289262,
    last_visited --(actually last login time, previously used for visit tracking but that's now done in redis, we use this for finding the players who have signed in)
    full_history_time
    cheese
    fh_unavailable --could use to tell player their profile is private, but we don't currently do this
    last_summaries_update --remove
    join_date --remove

CREATE TABLE player_matches
  PRIMARY KEY account_id, match_id
      "account_id": 103718195,
      "player_slot": 0,
      "hero_id": 85,
      "item_0": 180,
      "item_1": 9,
      "item_2": 0,
      "item_3": 229,
      "item_4": 79,
      "item_5": 182,
      "kills": 8,
      "deaths": 3,
      "assists": 21,
      "leaver_status": 0,
      "gold": 1948,
      "last_hits": 38,
      "denies": 2,
      "gold_per_min": 375,
      "xp_per_min": 380,
      "gold_spent": 8935,
      "hero_damage": 13190,
      "tower_damage": 419,
      "hero_healing": 422,
      "level": 14,
      "ability_upgrades": [
        {
          "ability": 5442,
          "time": 149,
          "level": 1
        },
      ]
      --parsed fields below
      "stuns": 0,
      "max_hero_hit": {
          value: 0
      },
      "times": [],
      "gold": [], --conflicts with the name in match.players
      "lh": [],
      "xp": [],
      //"pos_log": [],
      "obs_log": [],
      "sen_log": [],
      "hero_log": [], --can we remove along with pick order?
      "purchase_log": [],
      "kills_log": [],
      "buyback_log": [],
      //"pos": {},
      "lane_pos": {},
      "obs": {},
      "sen": {},
      "actions": {},
      "pings": {},
      "purchase": {},
      "gold_reasons": {},
      "xp_reasons": {},
      "kills": {},
      "item_uses": {},
      "ability_uses": {},
      "hero_hits": {},
      "damage": {},
      "damage_taken": {},
      "damage_inflictor": {},
      "runes": {},
      "killed_by": {},
      "modifier_applied": {},
      "kill_streaks": {},
      "multi_kills": {},
      "healing": {},
      "hero_id": "", --can we remove?  nick might be using this
      "kill_streaks_log": [], --an array of kill streak values
      "multi_kill_id_vals": [] --an array of multi kill values (the length of each multi kill)

CREATE TABLE player_ratings
  PRIMARY KEY account_id, match_id
  "match_id" : 1238535235, 
  "account_id" : 88367253, 
  "soloCompetitiveRank" : 1765, 
  "competitiveRank" : 2783, 
  "time" : ISODate("2015-02-14T19:51:14Z")

INDEX
matches.version
players.full_history_time
players.cheese

--MIGRATIONS
--player.ratings to player_ratings
--matches.parsed_data to matches
--matches.parsed_data.players to player_matches
--matches.players to player_matches
--subset of columns from matches to matches
--subset of columns from players to players