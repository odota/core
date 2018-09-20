#!/bin/bash
# This script sets up dependencies on a Cloud9 hosted environment
sudo service redis-server start
sudo service postgresql start
psql -f sql/create_tables.sql
echo "deb http://www.apache.org/dist/cassandra/debian 311x main" | sudo tee -a /etc/apt/sources.list.d/cassandra.sources.list
curl https://www.apache.org/dist/cassandra/KEYS | sudo apt-key add -
sudo apt-get update
sudo apt-get -y install cassandra
sudo service cassandra start