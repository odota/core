#!/bin/bash

if [ -n "$DOCKER_USERNAME" ]; then
  docker tag odota/core:latest odota/core:${TRAVIS_COMMIT}
  docker push odota/core:${TRAVIS_COMMIT}
  docker push odota/core:latest
fi
