CREATE EXTENSION pg_trgm;
CREATE INDEX on players USING GIN(personaname gin_trgm_ops);