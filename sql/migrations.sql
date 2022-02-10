CREATE UNIQUE INDEX CONCURRENTLY api_keys_temp_idx ON api_keys (account_id, subscription_id);
ALTER TABLE api_keys DROP CONSTRAINT api_keys_pkey,
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY USING INDEX api_keys_temp_idx,
    ADD COLUMN is_canceled boolean;