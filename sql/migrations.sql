DROP TABLE api_keys CASCADE;

CREATE TABLE IF NOT EXISTS api_keys (
  PRIMARY KEY(account_id),
  account_id bigint UNIQUE,
  api_key uuid UNIQUE,
  customer_id text NOT NULL,
  subscription_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS api_keys_account_id_idx on api_keys(account_id);

CREATE TABLE IF NOT EXISTS api_key_usage (
  PRIMARY KEY(account_id, api_key, timestamp),
  account_id bigint REFERENCES api_keys(account_id),
  customer_id text,
  api_key uuid,
  usage_count bigint,
  ip text,
  timestamp timestamp default current_timestamp
);
CREATE INDEX IF NOT EXISTS api_keys_usage_account_id_idx on api_key_usage(account_id);
CREATE INDEX IF NOT EXISTS api_keys_usage_timestamp_idx on api_key_usage(timestamp);