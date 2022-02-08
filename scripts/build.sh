#!/bin/bash

# Exit on error
set -e

sudo chmod 755 /var/log

# Give Casssandra/ES some time to start up
sudo docker-compose up -d && sleep 30 && sudo docker exec -it odota-core sh -c 'npm run test'

