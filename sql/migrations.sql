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
