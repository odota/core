#!/bin/bash

if [ -n "$DOCKER_USERNAME" ]; then
  sudo docker tag odota/core:latest odota/core:${TRAVIS_COMMIT}
  sudo docker push odota/core:${TRAVIS_COMMIT}
  sudo docker push odota/core:latest
fi
