#!/bin/bash

docker-compose up -d && sleep 80 && docker ps -a && docker logs odota-core && docker exec -i odota-core sh -c 'npm run test'
