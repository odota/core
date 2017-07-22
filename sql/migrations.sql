ALTER TABLE player_matches ADD backpack_0 int;
ALTER TABLE player_matches ADD backpack_1 int;
ALTER TABLE player_matches ADD backpack_2 int;

ALTER TABLE matches ADD radiant_score int;
ALTER TABLE matches ADD dire_score int;

ALTER TABLE player_matches ADD runes_log json[];

ALTER TABLE heroes ADD primary_attr text;
ALTER TABLE heroes ADD attack_type text;
ALTER TABLE heroes ADD roles text[];

ALTER TABLE players ADD last_match_time timestamp with time zone;

ALTER TABLE player_matches ADD lane int;
ALTER TABLE player_matches ADD lane_role int;
ALTER TABLE player_matches ADD is_roaming boolean;
ALTER TABLE heroes ADD legs int;

ALTER TABLE player_matches ADD firstblood_claimed int;
ALTER TABLE player_matches ADD teamfight_participation real;

ALTER TABLE player_matches ADD towers_killed int;
ALTER TABLE player_matches ADD roshans_killed int;
ALTER TABLE player_matches ADD observers_placed int;

ALTER TABLE public_matches ADD lobby_type int;
ALTER TABLE public_matches ADD game_mode int;

ALTER TABLE team_rating ADD last_match_time bigint;

ALTER TABLE player_matches ADD party_size int;