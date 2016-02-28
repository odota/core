select pid,substring(query from 0 for 50),now() - pg_stat_activity.query_start as duration from pg_stat_activity where pg_stat_activity.query <> ''::text and now() - pg_stat_activity.query_start > interval '5 seconds'
order by duration desc;
