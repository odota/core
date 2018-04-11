#!/bin/bash

if [ -n "$DOCKER_USERNAME" ]; then
  echo $DOCKER_PASSWORD | docker login --username "$DOCKER_USERNAME" --password-stdin
  docker tag odota/core:latest odota/core:${TRAVIS_COMMIT}
  docker push odota/core:${TRAVIS_COMMIT}
  docker push odota/core:latest
fi
