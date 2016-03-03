CREATE TABLE matches (
  match_id bigint PRIMARY KEY,
  match_seq_num bigint,
  radiant_win boolean,
  start_time integer,
  duration integer,
  tower_status_radiant integer,
  tower_status_dire integer,
  barracks_status_radiant integer,
  barracks_status_dire integer,
  cluster integer,
  first_blood_time integer,
  lobby_type integer,
  human_players integer,
  leagueid integer,
  positive_votes integer,
  negative_votes integer,
  game_mode integer,
  engine integer,
  picks_bans json[],
  --radiant_team_name varchar(255),
  --dire_team_name varchar(255),
  --radiant_captain integer,
  --dire_captain integer,
  --radiant_logo integer
  --dire_logo integer,
  --radiant_team_complete integer,
  --dire_team_complete integer,
  --radiant_team_id integer,
  --dire_team_id integer,
  --parsed data below
  parse_status integer,
  url varchar(255),
  chat json[],
  objectives json[],
  radiant_gold_adv integer[],
  radiant_xp_adv integer[],
  teamfights json[],
  version integer,
  pgroup json
  );
CREATE INDEX on matches(version);

CREATE TABLE player_matches (
  PRIMARY KEY(match_id, player_slot),
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE,
  account_id bigint,
  player_slot integer,
  hero_id integer,
  item_0 integer,
  item_1 integer,
  item_2 integer,
  item_3 integer,
  item_4 integer,
  item_5 integer,
  kills integer,
  deaths integer,
  assists integer,
  leaver_status integer,
  gold integer,
  last_hits integer,
  denies integer,
  gold_per_min integer,
  xp_per_min integer,
  gold_spent integer,
  hero_damage integer,
  tower_damage bigint,
  hero_healing bigint,
  level integer,
  --ability_upgrades json[],
  additional_units json[],
  --parsed fields below
  stuns real,
  max_hero_hit json,
  times integer[],
  gold_t integer[],
  lh_t integer[],
  xp_t integer[],
  obs_log json[],
  sen_log json[],
  purchase_log json[],
  kills_log json[],
  buyback_log json[],
  lane_pos json,
  obs json,
  sen json,
  actions json,
  pings json,
  purchase json,
  gold_reasons json,
  xp_reasons json,
  killed json,
  item_uses json,
  ability_uses json,
  hero_hits json,
  damage json,
  damage_taken json,
  damage_inflictor json,
  runes json,
  killed_by json,
  kill_streaks json,
  multi_kills json,
  healing json,
  life_state json,
  modifier_applied json
  --disabled due to incompatibility
  --kill_streaks_log json[][], --an array of kill streak values
  --multi_kill_id_vals integer[] --an array of multi kill values (the length of each multi kill)
);
CREATE INDEX on player_matches(account_id);

CREATE TABLE players (
  account_id bigint PRIMARY KEY,
  steamid varchar(32),
  avatar varchar(255),
  avatarmedium varchar(255),
  avatarfull varchar(255),
  profileurl varchar(255),
  personaname varchar(255),
  last_login timestamp with time zone,
  full_history_time timestamp with time zone,
  cheese integer DEFAULT 0,
  fh_unavailable boolean,
  loccountrycode varchar(2)
  /*
    "communityvisibilitystate" : 3,
    "lastlogoff" : 1426020853,
    "loccityid" : 44807,
    "locstatecode" : "16",
    "personastate" : 0,
    "personastateflags" : 0,
    "primaryclanid" : "103582791433775490",
    "profilestate" : 1,
    "realname" : "Alper",
    "timecreated" : 1332289262,
  */
);
CREATE INDEX on players(full_history_time);
CREATE INDEX on players(last_login);
CREATE INDEX on players(cheese);

CREATE TABLE player_ratings (
  PRIMARY KEY(account_id, time),
  account_id bigint,
  match_id bigint,
  solo_competitive_rank integer,
  competitive_rank integer,
  time timestamp with time zone
);

CREATE TABLE subscriptions (
  PRIMARY KEY(customer_id),
  account_id bigint REFERENCES players(account_id) ON DELETE CASCADE,
  customer_id varchar(255),
  amount int,
  active_until date
);
CREATE INDEX on subscriptions(account_id);
CREATE INDEX on subscriptions(customer_id);

CREATE TABLE match_skill (
  match_id bigint PRIMARY KEY,
  skill integer
);

CREATE TABLE match_logs (
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE,
  player_slot integer,
  time integer,
  type varchar(50),
  key varchar(50),
  value integer
);
CREATE INDEX on match_logs(match_id);

CREATE TABLE notable_players (
  account_id bigint PRIMARY KEY,
  name varchar(255),
  country_code varchar(2),
  fantasy_role int,
  team_id int,
  team_name varchar(255),
  team_tag varchar(255),
  is_locked boolean,
  is_pro boolean,
  locked_until integer
);