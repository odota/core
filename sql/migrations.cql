ALTER TABLE player_matches ADD backpack_0 int;
ALTER TABLE player_matches ADD backpack_1 int;
ALTER TABLE player_matches ADD backpack_2 int;

ALTER TABLE matches ADD radiant_score int;
ALTER TABLE matches ADD dire_score int;

ALTER TABLE player_matches ADD runes_log text;

ALTER TABLE player_matches ADD repicked boolean;
ALTER TABLE player_matches ADD randomed boolean;
ALTER TABLE player_matches ADD pred_vict boolean;

ALTER TABLE matches ADD skill int;

ALTER TABLE player_matches ADD performance_others text;