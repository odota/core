CREATE UNIQUE INDEX CONCURRENTLY api_keys_temp_idx ON api_keys (account_id, subscription_id);
ALTER TABLE api_keys DROP CONSTRAINT api_keys_pkey CASCADE,
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY USING INDEX api_keys_temp_idx,
    ADD COLUMN is_canceled boolean;
ALTER TABLE api_key_usage ADD CONSTRAINT api_key_usage_api_key_fkey FOREIGN KEY (api_key) REFERENCES api_keys(api_key) MATCH FULL;