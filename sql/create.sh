#!/bin/bash
sudo -u postgres dropdb yasp
sudo -u postgres dropuser yasp
sudo -u postgres createuser yasp
sudo -u postgres psql -c "ALTER USER yasp WITH PASSWORD 'yasp';"
sudo -u postgres createdb yasp --owner yasp
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
cat sql/create_tables.sql | sudo -u postgres psql -d postgresql://yasp:yasp@localhost/yasp -f -
