DROP TABLE api_keys;

CREATE TABLE IF NOT EXISTS api_keys (
  PRIMARY KEY(account_id),
  account_id bigint UNIQUE,
  api_key uuid UNIQUE,
  customer_id text NOT NULL,
  subscription_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS api_keys_account_id_idx on api_keys(account_id);