#!/bin/bash

# main-launch.sh
# Script run in the main container
# If this script exits, so does the main container

# Rebuild to replace mapped directory build
npm run build

pm2 start ecosystem.config.js --only web

# Sleep since processes are run by pm2
sleep infinity
