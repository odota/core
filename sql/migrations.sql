ALTER TABLE scenarios DROP COLUMN IF EXISTS pings;
ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS "scenarios_pings_time_epoch_week_key";
UPDATE team_scenarios SET scenario = 'first_blood' WHERE scenario = 'First Blood';
UPDATE team_scenarios SET scenario = 'neg_chat_1min' WHERE scenario = 'Negativity in chat before 1 minute';
UPDATE team_scenarios SET scenario = 'pos_chat_1min' WHERE scenario = 'Positivity in chat before 1 minute';
UPDATE team_scenarios SET scenario = 'courier_kill' WHERE scenario = 'Courier Kill before 3 minutes';
