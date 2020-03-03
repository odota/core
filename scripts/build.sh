#!/bin/bash

# Exit on error
set -e

sudo docker-compose up -d
# Give Casssandra some time to start up
sleep 5
sudo docker exec -it odota-core sh -c 'npm run test'
