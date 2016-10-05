#!/bin/bash

# main-launch.sh
# Script run in the main container
# If this script exits, so does the main container

# Rebuild to replace mapped directory build
npm run build

case $1 in
    'basic')
        # This is enough to open the site in a browser and request parses by ID.
        pm2 start profiles/basic.json
    ;;
    'full')
        pm2 start profiles/full.json
    ;;
    'custom-profile')
        # To use this option you'll have to provide your custom.json profile. It's gitignored.
        pm2 start profiles/custom.json
    ;;
    *)
        pm2 start profiles/full.json
    ;;
esac

# We shall now display logs indefinitely
pm2 logs
