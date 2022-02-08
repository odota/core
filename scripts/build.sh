#!/bin/bash

# Exit on error
set -e

docker-compose up -d && sleep 10 && docker exec -it odota-core sh -c 'npm run test'

