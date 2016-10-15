#!/bin/bash

# main-launch.sh
# Script run in the main container
# If this script exits, so does the main container

# Rebuild to replace mapped directory build
npm run build

pm2 start manifest.json

# We shall now display logs indefinitely
pm2 logs
