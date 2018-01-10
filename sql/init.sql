ALTER USER postgres PASSWORD 'postgres';
CREATE ROLE readonly PASSWORD 'readonly';
REVOKE CREATE ON SCHEMA public FROM public;
GRANT CREATE ON SCHEMA public TO postgres;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM readonly;
CREATE DATABASE yasp;
ALTER DATABASE yasp SET seq_page_cost = 1;
ALTER DATABASE yasp SET random_page_cost = 0.1;
