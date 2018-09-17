#!/bin/bash

# main-launch.sh
# Script run in the main container
# If this script exits, so does the main container

# Rebuild to replace mapped directory build
npm run build

pm2 start manifest.json

# Stop everything to prevent overload
pm2 stop all

# Start web server
pm2 start web

# We shall now display logs indefinitely
pm2 logs
