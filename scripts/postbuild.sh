#!/bin/bash

if [ -n "$DOCKER_USERNAME" ]; then
  echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
  sudo docker tag odota/core:latest odota/core:${TRAVIS_COMMIT}
  sudo docker push odota/core:${TRAVIS_COMMIT}
  sudo docker push odota/core:latest
fi
