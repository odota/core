#!/bin/bash

# Start web server by default if not in CI
if [[ -z "$CI" ]]
then
    pm2 start ecosystem.config.js --only web
fi

sleep infinity