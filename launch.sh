#!/bin/bash

# Start web server by default
pm2 start ecosystem.config.js --only web

sleep infinity