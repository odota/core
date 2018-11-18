CREATE TABLE IF NOT EXISTS webhooks (
  PRIMARY KEY(hook_id),
  hook_id uuid UNIQUE,
  account_id bigint,
  url text NOT NULL UNIQUE,
  subscriptions jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS webhooks_hook_id_idx on webhooks(hook_id);
CREATE INDEX IF NOT EXISTS webhooks_account_id_idx on webhooks(account_id);