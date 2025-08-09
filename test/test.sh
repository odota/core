#!/bin/bash

docker compose -f docker-compose.yml up -d && sleep 45 && docker ps -a && docker logs odota-core && docker exec -i odota-core sh -c 'npm run test'
