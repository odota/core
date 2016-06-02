#!/bin/bash

# main-launch.sh
# Script run in the main container
# If this scripts exits, so does the main container

npm run build

case $1 in
    'basic')
        # This is enough to open the site in a browser and request parses by ID.
        # web.js will be watched for changes 
        pm2 start svc/web.js --watch
        pm2 start svc/parser.js
        pm2 start svc/requests.js
        pm2 start svc/retriever.js
    ;;
    'everything')
        pm2 start pm2.json
    ;;
    *)
        pm2 start pm2.json
    ;;
esac

# We shall now display webserver logs indefinitely
pm2 logs web
