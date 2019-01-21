CREATE TABLE IF NOT EXISTS webhooks (
  PRIMARY KEY(hook_id),
  hook_id uuid UNIQUE,
  account_id bigint,
  url text NOT NULL,
  subscriptions jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS webhooks_account_id_idx on webhooks(account_id);

ALTER TABLE player_matches ADD connection_log json[];
