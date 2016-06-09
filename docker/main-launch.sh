#!/bin/bash

# main-launch.sh
# Script run in the main container
# If this scripts exits, so does the main container

npm run build

case $1 in
    'basic')
        # This is enough to open the site in a browser and request parses by ID.
        pm2 start profiles/basic.json
    ;;
    'everything')
        pm2 start profiles/everything.json
    ;;
    *)
        pm2 start profiles/everything.json
    ;;
esac

# We shall now display webserver logs indefinitely
pm2 logs web
