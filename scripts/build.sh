#!/bin/bash

# Exit on error
set -e

docker-compose -f docker-compose.ci.yml up -d && sleep 75 && docker ps -a && docker logs odota-core && docker exec -i odota-core sh -c 'npm run test'
npm run dockerbuild:retriever
