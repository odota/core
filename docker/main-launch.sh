#!/bin/bash

# main-launch.sh
# Script run in the main container
# If this script exits, so does the main container

# Rebuild since we've mapped in our local working directory, which may not have a build.
npm run build

# By default, this just waits for input from stdin, allowing the user to run pm2 commands.
npm start
