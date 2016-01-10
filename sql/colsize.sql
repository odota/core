select
    sum(pg_column_size(lane_pos)) as total_size,
    avg(pg_column_size(lane_pos)) as average_size,
    sum(pg_column_size(lane_pos)) * 100.0 / pg_total_relation_size('player_matches') as percentage
from player_matches;