CREATE KEYSPACE yasp WITH REPLICATION = { 'class' : 'NetworkTopologyStrategy', 'datacenter1': 1 };
CREATE TABLE yasp.player_caches (account_id bigint, match_id bigint, match text, PRIMARY KEY(account_id, match_id));
