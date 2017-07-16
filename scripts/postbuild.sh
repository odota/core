#!/bin/bash

sudo docker run --net=host -i odota/core sh -c 'ls node_modules/steam/node_modules/steam-resources/node_modules/bytebuffer/dist/'

if [ -n "$DOCKER_USERNAME" ]; then
  docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"
  docker tag odota/core:latest odota/core:${TRAVIS_COMMIT}
  docker push odota/core:${TRAVIS_COMMIT}
  docker push odota/core:latest
fi
