#!/bin/bash

psql -U postgres < sql/init.sql
psql -U postgres yasp < sql/create_tables.sql
