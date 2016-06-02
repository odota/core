#!/bin/bash

/etc/init.d/postgresql start
psql -U postgres < sql/init.sql
psql -U postgres yasp < sql/create_tables.sql
/etc/init.d/postgresql stop
