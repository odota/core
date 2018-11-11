CREATE TABLE IF NOT EXISTS webhooks (
  PRIMARY KEY(hook_id),
  hook_id bigint UNIQUE,
  account_id bigint UNIQUE,
  url text NOT NULL UNIQUE,
  subscriptions text NOT NULL
);

CREATE INDEX IF NOT EXISTS webhooks_hook_id_idx on webhooks(hook_id);
CREATE INDEX IF NOT EXISTS webhooks_account_id_idx on webhooks(account_id);