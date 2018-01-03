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
  hero smallint,
  item text,
  time smallint,
  pings integer,
  game_duration smallint,
  lane smallint,
  games      bigint DEFAULT 0,
  wins       bigint DEFAULT 0,
  CONSTRAINT scenario UNIQUE (hero, item, time),
  CONSTRAINT scenario2 UNIQUE (pings, game_duration),
  CONSTRAINT scenario3 UNIQUE (hero, lane, game_duration)
); 

CREATE TABLE IF NOT EXISTS team_scenarios (
  scenario   text,
  is_radiant BOOLEAN,
  region     smallint,
  games      bigint DEFAULT 0,
  wins       bigint DEFAULT 0,
  CONSTRAINT team_scenarios_constraint UNIQUE (scenario, is_radiant, region)
);
