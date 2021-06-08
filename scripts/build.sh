#!/bin/bash

# Exit on error
set -e

echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin

# Give Casssandra/ES some time to start up
sudo docker-compose up -d && sleep 30 && sudo docker exec -it odota-core sh -c 'npm run test'

