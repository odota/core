CREATE EXTENSION pg_trgm;
CREATE EXTENSION tsm_system_rows;

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
  radiant_score integer,
  dire_score integer,
  picks_bans json[],
  radiant_team_id integer,
  dire_team_id integer,
  radiant_team_name varchar(255),
  dire_team_name varchar(255),
  radiant_team_complete smallint,
  dire_team_complete smallint,
  radiant_captain bigint,
  dire_captain bigint,
  chat json[],
  objectives json[],
  radiant_gold_adv integer[],
  radiant_xp_adv integer[],
  teamfights json[],
  version integer,
  cosmetics json
);
CREATE INDEX on matches(leagueid) WHERE leagueid > 0;

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
  backpack_0 integer,
  backpack_1 integer,
  backpack_2 integer,
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
  dn_t integer[],
  xp_t integer[],
  obs_log json[],
  sen_log json[],
  obs_left_log json[],
  sen_left_log json[],
  purchase_log json[],
  kills_log json[],
  buyback_log json[],
  runes_log json[],
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
  life_state json,
  damage_inflictor_received json,
  obs_placed int,
  sen_placed int,
  creeps_stacked int,
  camps_stacked int,
  rune_pickups int,
  ability_upgrades_arr integer[],
  party_id int,
  permanent_buffs json[]
);
CREATE INDEX on player_matches(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX on player_matches(hero_id);

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
CREATE INDEX on players(cheese) WHERE cheese IS NOT NULL;
CREATE INDEX on players USING GIN(personaname gin_trgm_ops);

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

CREATE TABLE match_logs (
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE,
  time int,
  type varchar(100),
  team smallint,
  unit varchar(100),
  key varchar(1000),
  value int,
  slot smallint,
  player_slot smallint,
  player1 int,
  player2 int,
  attackerhero boolean,
  targethero boolean,
  attackerillusion boolean,
  targetillusion boolean,
  inflictor varchar(100),
  gold_reason smallint,
  xp_reason smallint,
  attackername varchar(100),
  targetname varchar(100),
  sourcename varchar(100),
  targetsourcename varchar(100),
  valuename varchar(100),
  gold int,
  lh int,
  xp int,
  x smallint,
  y smallint,
  z smallint,
  entityleft boolean,
  ehandle int,
  stuns real,
  hero_id smallint,
  life_state smallint,
  level smallint,
  kills smallint,
  deaths smallint,
  assists smallint,
  denies smallint,
  attackername_slot smallint,
  targetname_slot smallint,
  sourcename_slot smallint,
  targetsourcename_slot smallint,
  player1_slot smallint,
  obs_placed int,
  sen_placed int,
  creeps_stacked int,
  camps_stacked int,
  rune_pickups int
);
CREATE INDEX ON match_logs(match_id);
CREATE INDEX ON match_logs(match_id, player_slot) WHERE player_slot IS NOT NULL;
CREATE INDEX ON match_logs(match_id, player1_slot) WHERE player1_slot IS NOT NULL;
CREATE INDEX ON match_logs(match_id, attackername_slot) WHERE attackername_slot IS NOT NULL;
CREATE INDEX ON match_logs(match_id, targetname_slot) WHERE targetname_slot IS NOT NULL;
CREATE INDEX ON match_logs(match_id, sourcename_slot) WHERE sourcename_slot IS NOT NULL;
CREATE INDEX ON match_logs(match_id, targetsourcename_slot) WHERE targetsourcename_slot IS NOT NULL;
CREATE INDEX ON match_logs(match_id, valuename) WHERE valuename IS NOT NULL;
CREATE INDEX ON match_logs(match_id, type);
CREATE INDEX on match_logs(type);

CREATE TABLE picks_bans(
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE,
  is_pick boolean,
  hero_id int,
  team smallint,
  ord smallint,
  PRIMARY KEY (match_id, ord)
);

CREATE TABLE leagues(
  leagueid bigint PRIMARY KEY,
  ticket varchar(255),
  banner varchar(255),
  tier varchar(255),
  name varchar(255)
);

CREATE TABLE teams(
  team_id bigint PRIMARY KEY,
  name varchar(255),
  tag varchar(255)
);

CREATE TABLE heroes(
  id int PRIMARY KEY,
  name text,
  localized_name text,
  primary_attr text,
  attack_type text,
  roles text[]
);

CREATE TABLE match_patch(
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE PRIMARY KEY,
  patch text
);

CREATE TABLE team_match(
  team_id bigint,
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE,
  radiant boolean,
  PRIMARY KEY(team_id, match_id)
);

CREATE TABLE match_gcdata(
  match_id bigint PRIMARY KEY,
  cluster int,
  replay_salt int,
  series_id int,
  series_type int
);

CREATE TABLE items(
  id int PRIMARY KEY,
  name text,
  cost int,
  secret_shop smallint,
  side_shop smallint,
  recipe smallint,
  localized_name text
);

CREATE TABLE cosmetics(
  item_id int PRIMARY KEY,
  name text,
  prefab text,
  creation_date timestamp with time zone,
  image_inventory text,
  image_path text,
  item_description text,
  item_name text,
  item_rarity text,
  item_type_name text,
  used_by_heroes text
);

CREATE TABLE public_matches (
  match_id bigint PRIMARY KEY,
  match_seq_num bigint,
  radiant_win boolean,
  start_time integer,
  duration integer,
  avg_mmr integer,
  num_mmr integer
);
CREATE INDEX on public_matches(start_time);
CREATE INDEX on public_matches(avg_mmr);

CREATE TABLE public_player_matches (
  PRIMARY KEY(match_id, player_slot),
  match_id bigint REFERENCES public_matches(match_id) ON DELETE CASCADE,
  player_slot integer,
  hero_id integer
);
CREATE INDEX on public_player_matches(hero_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly') THEN
        GRANT SELECT ON matches TO readonly;
        GRANT SELECT ON player_matches TO readonly;
        GRANT SELECT ON public_matches TO readonly;
        GRANT SELECT ON public_player_matches TO readonly;
        GRANT SELECT ON heroes TO readonly;
        GRANT SELECT ON players TO readonly;
        GRANT SELECT ON leagues TO readonly;
        GRANT SELECT ON items TO readonly;
        GRANT SELECT ON teams TO readonly;
        GRANT SELECT ON team_match TO readonly;
        GRANT SELECT ON match_patch TO readonly;
        GRANT SELECT ON picks_bans TO readonly;
        GRANT SELECT ON match_logs TO readonly;
        GRANT SELECT ON notable_players TO readonly;
    END IF;
END
$$;