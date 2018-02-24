CREATE TABLE IF NOT EXISTS rank_tier (
  PRIMARY KEY (account_id),
  account_id bigint,
  rating int
);
ALTER TABLE public_matches ADD avg_rank_tier double precision;
ALTER TABLE public_matches ADD num_rank_tier integer;
CREATE INDEX IF NOT EXISTS public_matches_avg_rank_tier_idx on public_matches(avg_rank_tier) WHERE avg_rank_tier IS NOT NULL;

ALTER TABLE player_matches ADD ability_targets json;

ALTER TABLE public_matches ADD cluster integer;

CREATE TABLE IF NOT EXISTS scenarios (
  hero_id smallint,
  item text,
  time integer,
  pings integer,
  lane_role smallint,
  games bigint DEFAULT 1,
  wins bigint,
  UNIQUE (hero_id, item, time),
  UNIQUE (pings, time),
  UNIQUE (hero_id, lane_role, time)
); 

CREATE TABLE IF NOT EXISTS team_scenarios (
  scenario text,
  is_radiant boolean,
  region smallint,
  games bigint DEFAULT 1,
  wins bigint,
  UNIQUE (scenario, is_radiant, region)
);

ALTER TABLE scenarios ADD epoch_week smallint;
ALTER TABLE team_scenarios ADD epoch_week smallint;
ALTER TABLE scenarios DROP CONSTRAINT "scenarios_hero_id_item_time_key";
ALTER TABLE scenarios DROP CONSTRAINT "scenarios_hero_id_lane_role_time_key";
ALTER TABLE scenarios DROP CONSTRAINT "scenarios_pings_time_key";
ALTER TABLE team_scenarios DROP CONSTRAINT "team_scenarios_scenario_is_radiant_region_key";
ALTER TABLE scenarios ADD UNIQUE (hero_id, item, time, epoch_week);
ALTER TABLE scenarios ADD UNIQUE (pings, time, epoch_week);
ALTER TABLE scenarios ADD UNIQUE (hero_id, lane_role, time, epoch_week);
ALTER TABLE team_scenarios ADD UNIQUE (scenario, is_radiant, region, epoch_week);
--- !!!
DELETE FROM team_scenarios WHERE epoch_week IS NULL;
DELETE FROM scenarios WHERE epoch_week IS NULL;