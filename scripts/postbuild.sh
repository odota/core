#!/bin/bash

if [ -n "$DOCKER_USERNAME" ]; then
  docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"
  docker tag yasp/yasp:latest yasp/yasp:${TRAVIS_COMMIT}
  docker push yasp/yasp:${TRAVIS_COMMIT}
  docker push yasp/yasp:latest
fi
