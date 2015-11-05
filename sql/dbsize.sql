SELECT schemaname,A.relname,n_live_tup,pg_size_pretty(pg_total_relation_size(C.oid)) AS "total_size"
FROM pg_stat_user_tables A
JOIN pg_class C ON C.relname = A.relname
ORDER BY pg_total_relation_size(C.oid) DESC;
