CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS matches (
  match_id bigint PRIMARY KEY,
  match_seq_num bigint,
  radiant_win boolean,
  start_time bigint,
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
  radiant_team_name text,
  dire_team_name text,
  radiant_team_complete smallint,
  dire_team_complete smallint,
  radiant_captain bigint,
  dire_captain bigint,
  chat json[],
  objectives json[],
  radiant_gold_adv integer[],
  radiant_xp_adv integer[],
  teamfights json[],
  draft_timings json[],
  version integer,
  cosmetics json,
  series_id integer,
  series_type integer,
  replay_salt integer
);
CREATE INDEX IF NOT EXISTS matches_leagueid_idx on matches(leagueid) WHERE leagueid > 0;
CREATE INDEX IF NOT EXISTS matches_start_time_idx on matches(start_time);

CREATE TABLE IF NOT EXISTS player_matches (
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
  item_neutral integer,
  backpack_0 integer,
  backpack_1 integer,
  backpack_2 integer,
  backpack_3 integer,
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
  connection_log json[],
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
  ability_targets json,
  damage_targets json,
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
  permanent_buffs json[],
  hero_variant int,
  lane int,
  lane_role int,
  is_roaming boolean,
  firstblood_claimed int,
  teamfight_participation real,
  towers_killed int,
  roshans_killed int,
  observers_placed int,
  party_size int,
  net_worth int,
  neutral_tokens_log json[],
  neutral_item_history json[]
);
CREATE INDEX IF NOT EXISTS player_matches_account_id_idx on player_matches(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS player_matches_hero_id_idx on player_matches(hero_id);

CREATE TABLE IF NOT EXISTS players (
  account_id bigint PRIMARY KEY,
  steamid text,
  avatar text,
  avatarmedium text,
  avatarfull text,
  profileurl text,
  personaname text,
  plus boolean DEFAULT false,
  last_login timestamp with time zone,
  full_history_time timestamp with time zone,
  cheese integer DEFAULT 0,
  fh_unavailable boolean,
  loccountrycode text,
  last_match_time timestamp with time zone,
  profile_time timestamp with time zone,
  rank_tier_time timestamp with time zone
);
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
CREATE INDEX IF NOT EXISTS players_cheese_idx on players(cheese) WHERE cheese IS NOT NULL AND cheese > 0;
--only GIST indexes support ordering by similarity
CREATE INDEX IF NOT EXISTS players_personaname_idx_gist ON players USING GIST(personaname gist_trgm_ops);
CREATE INDEX IF NOT EXISTS players_full_history_time_idx ON players(full_history_time ASC NULLS FIRST);
CREATE INDEX IF NOT EXISTS players_profile_time_idx ON players(profile_time ASC NULLS FIRST);
CREATE INDEX IF NOT EXISTS players_rank_tier_time_idx ON players(rank_tier_time ASC NULLS FIRST);

CREATE TABLE IF NOT EXISTS player_ratings (
  PRIMARY KEY(account_id, time),
  account_id bigint,
  match_id bigint,
  solo_competitive_rank integer,
  competitive_rank integer,
  time timestamp with time zone
);

CREATE TABLE IF NOT EXISTS subscriptions (
  PRIMARY KEY(customer_id),
  account_id bigint REFERENCES players(account_id) ON DELETE CASCADE,
  customer_id text,
  amount int,
  active_until date
);
CREATE INDEX IF NOT EXISTS subscriptions_account_id_idx on subscriptions(account_id);
CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx on subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS webhooks (
  PRIMARY KEY(hook_id),
  hook_id uuid UNIQUE,
  account_id bigint,
  url text NOT NULL,
  subscriptions jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS webhooks_account_id_idx on webhooks(account_id);

CREATE TABLE IF NOT EXISTS api_keys (
  PRIMARY KEY(account_id, subscription_id),
  account_id bigint NOT NULL,
  api_key uuid UNIQUE,
  customer_id text NOT NULL,
  subscription_id text NOT NULL UNIQUE,
  is_canceled boolean
);

CREATE TABLE IF NOT EXISTS api_key_usage (
  PRIMARY KEY(account_id, api_key, ip, timestamp),
  account_id bigint,
  customer_id text,
  api_key uuid REFERENCES api_keys(api_key),
  usage_count bigint,
  ip text,
  timestamp timestamp default current_timestamp
);
CREATE INDEX IF NOT EXISTS api_keys_usage_account_id_idx on api_key_usage(account_id);
CREATE INDEX IF NOT EXISTS api_keys_usage_timestamp_idx on api_key_usage(timestamp);

CREATE TABLE IF NOT EXISTS user_usage (
  account_id bigint,
  ip text,
  usage_count bigint,
  timestamp timestamp default current_timestamp
);
CREATE INDEX IF NOT EXISTS user_usage_account_id_idx on user_usage(account_id);
CREATE INDEX IF NOT EXISTS user_usage_timestamp_idx on user_usage(timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS user_usage_unique_idx on user_usage(account_id, ip, timestamp);

CREATE TABLE IF NOT EXISTS notable_players (
  account_id bigint PRIMARY KEY,
  name text,
  country_code text,
  fantasy_role int,
  team_id int,
  team_name text,
  team_tag text,
  is_locked boolean,
  is_pro boolean,
  locked_until integer
);

CREATE TABLE IF NOT EXISTS picks_bans(
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE,
  is_pick boolean,
  hero_id int,
  team smallint,
  ord smallint,
  PRIMARY KEY (match_id, ord)
);

CREATE TABLE IF NOT EXISTS leagues(
  leagueid bigint PRIMARY KEY,
  ticket text,
  banner text,
  tier text,
  name text
);

CREATE TABLE IF NOT EXISTS teams(
  team_id bigint PRIMARY KEY,
  name text,
  tag text,
  logo_url text
);

CREATE TABLE IF NOT EXISTS heroes(
  id int PRIMARY KEY,
  name text,
  localized_name text,
  primary_attr text,
  attack_type text,
  roles text[]
);

CREATE TABLE IF NOT EXISTS match_patch(
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE PRIMARY KEY,
  patch text
);

CREATE TABLE IF NOT EXISTS team_match(
  team_id bigint,
  match_id bigint REFERENCES matches(match_id) ON DELETE CASCADE,
  radiant boolean,
  PRIMARY KEY(team_id, match_id)
);

CREATE TABLE IF NOT EXISTS items(
  id int PRIMARY KEY,
  name text,
  cost int,
  secret_shop smallint,
  side_shop smallint,
  recipe smallint,
  localized_name text
);

CREATE TABLE IF NOT EXISTS cosmetics(
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

CREATE TABLE IF NOT EXISTS public_matches (
  match_id bigint PRIMARY KEY,
  match_seq_num bigint,
  radiant_win boolean,
  start_time bigint,
  duration integer,
  lobby_type integer,
  game_mode integer,
  avg_rank_tier double precision,
  num_rank_tier integer,
  cluster integer,
  radiant_team integer[],
  dire_team integer[]
);
CREATE INDEX IF NOT EXISTS public_matches_start_time_idx on public_matches(start_time);
CREATE INDEX IF NOT EXISTS public_matches_avg_rank_tier_idx on public_matches(avg_rank_tier) WHERE avg_rank_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS public_matches_radiant_team_idx_gin ON public_matches USING GIN(radiant_team);
CREATE INDEX IF NOT EXISTS public_matches_dire_team_idx_gin ON public_matches USING GIN(dire_team);

CREATE TABLE IF NOT EXISTS team_rating (
  PRIMARY KEY(team_id),
  team_id bigint,
  rating real,
  wins int,
  losses int,
  last_match_time bigint,
  delta real,
  match_id bigint
);
CREATE INDEX IF NOT EXISTS team_rating_rating_idx ON team_rating(rating);

CREATE TABLE IF NOT EXISTS hero_ranking (
  PRIMARY KEY (account_id, hero_id),
  account_id bigint,
  hero_id int,
  score double precision
);
CREATE INDEX IF NOT EXISTS hero_ranking_hero_id_score_idx ON hero_ranking(hero_id, score);

CREATE TABLE IF NOT EXISTS queue (
  PRIMARY KEY (id),
  id bigserial,
  type text,
  timestamp timestamp with time zone,
  attempts int,
  data json,
  next_attempt_time timestamp with time zone,
  priority int,
  job_key text,
  UNIQUE(job_key)
);
CREATE INDEX IF NOT EXISTS queue_type_priority_id_idx on queue(type, priority, id);

CREATE TABLE IF NOT EXISTS solo_competitive_rank (
  PRIMARY KEY (account_id),
  account_id bigint,
  rating int
);

CREATE TABLE IF NOT EXISTS competitive_rank (
  PRIMARY KEY (account_id),
  account_id bigint,
  rating int
);

CREATE TABLE IF NOT EXISTS rank_tier (
  PRIMARY KEY (account_id),
  account_id bigint,
  rating int
);

CREATE TABLE IF NOT EXISTS leaderboard_rank (
  PRIMARY KEY (account_id),
  account_id bigint,
  rating int
);

CREATE TABLE IF NOT EXISTS rank_tier_history (
  PRIMARY KEY(account_id, time),
  account_id bigint,
  time timestamp with time zone,
  rank_tier int
);

CREATE TABLE IF NOT EXISTS scenarios (
  hero_id smallint,
  item text,
  time integer,
  lane_role smallint,
  games bigint DEFAULT 1,
  wins bigint,
  epoch_week integer,
  UNIQUE (hero_id, item, time, epoch_week),
  UNIQUE (hero_id, lane_role, time, epoch_week)
);

CREATE TABLE IF NOT EXISTS team_scenarios (
  scenario text,
  is_radiant boolean,
  region smallint,
  games bigint DEFAULT 1,
  wins bigint,
  epoch_week integer,
  UNIQUE (scenario, is_radiant, region, epoch_week)
);

CREATE TABLE IF NOT EXISTS parsed_matches (
  PRIMARY KEY (match_id),
  match_id bigint,
  is_archived boolean
);
CREATE INDEX IF NOT EXISTS parsed_matches_is_archived_idx ON parsed_matches(is_archived);

CREATE TABLE IF NOT EXISTS subscriber (
  PRIMARY KEY (account_id),
  account_id bigint,
  customer_id text,
  status text
);

--Stores matches that the user has played in but might be previously anonymous in API data
--We might want to fetch the data from our own DB and fill player_caches
CREATE TABLE IF NOT EXISTS player_match_history(
  PRIMARY KEY (match_id, account_id),
  account_id bigint,
  match_id bigint,
  player_slot integer,
  retries integer
);
CREATE INDEX IF NOT EXISTS player_match_history_retries_idx ON player_match_history(retries ASC NULLS FIRST);

CREATE TABLE IF NOT EXISTS player_computed_mmr(
  PRIMARY KEY(account_id),
  account_id bigint,
  computed_mmr real,
  delta real,
  match_id bigint
);
CREATE INDEX IF NOT EXISTS player_computed_mmr_computed_mmr_idx ON player_computed_mmr(computed_mmr);

CREATE TABLE IF NOT EXISTS player_computed_mmr_turbo(
  PRIMARY KEY(account_id),
  account_id bigint,
  computed_mmr real,
  delta real,
  match_id bigint
);
CREATE INDEX IF NOT EXISTS player_computed_mmr_turbo_computed_mmr_idx ON player_computed_mmr_turbo(computed_mmr);

CREATE TABLE IF NOT EXISTS rating_queue(
  PRIMARY KEY(match_seq_num),
  match_seq_num bigint,
  match_id bigint,
  radiant_win boolean,
  game_mode int
);

CREATE TABLE IF NOT EXISTS insert_queue(
  PRIMARY KEY(match_seq_num),
  match_seq_num bigint,
  data json,
  processed boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS insert_queue_processed_match_seq_num_idx ON insert_queue(processed, match_seq_num);

CREATE TABLE IF NOT EXISTS league_match(
  PRIMARY KEY (leagueid, match_id),
  leagueid int,
  match_id bigint
);

CREATE TABLE IF NOT EXISTS aliases(
  PRIMARY KEY(account_id, personaname),
  account_id bigint,
  personaname text,
  name_since timestamp with time zone
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly') THEN
        GRANT SELECT ON matches TO readonly;
        GRANT SELECT ON player_matches TO readonly;
        GRANT SELECT ON heroes TO readonly;
        GRANT SELECT ON leagues TO readonly;
        GRANT SELECT ON items TO readonly;
        GRANT SELECT ON teams TO readonly;
        GRANT SELECT ON team_match TO readonly;
        GRANT SELECT ON match_patch TO readonly;
        GRANT SELECT ON picks_bans TO readonly;
        GRANT SELECT ON notable_players TO readonly;
        GRANT SELECT ON public_matches TO readonly;
        GRANT SELECT ON team_rating TO readonly;
    END IF;
END
$$;
