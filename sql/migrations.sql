CREATE UNIQUE INDEX CONCURRENTLY api_keys_temp_idx ON api_keys (account_id, subscription_id);
ALTER TABLE api_keys DROP CONSTRAINT api_keys_pkey CASCADE,
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY USING INDEX api_keys_temp_idx,
    ADD COLUMN is_canceled boolean;
ALTER TABLE api_key_usage ADD CONSTRAINT api_key_usage_api_key_fkey FOREIGN KEY (api_key) REFERENCES api_keys(api_key) MATCH FULL;
-- Cover match_id in the hero_id index so hero lookups don't have to visit the
-- heap for it, which is the bulk of the cost in hero combination queries
CREATE INDEX CONCURRENTLY player_matches_hero_id_match_id_idx ON player_matches (hero_id, match_id);
DROP INDEX CONCURRENTLY player_matches_hero_id_idx;
ALTER INDEX player_matches_hero_id_match_id_idx RENAME TO player_matches_hero_id_idx;
