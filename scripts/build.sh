#!/bin/bash

# Exit on error
set -e

sudo docker-compose up -d
sudo docker exec -it odota-core sh -c 'npm run test'
