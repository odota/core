#!/bin/bash

if (( EUID != 0 )); then
   echo "You must be root to do this." 1>&2
   exit 100
fi
sudo npm install

npm run constants

npm run buildparser

nf export -o /etc/init/

restart foreman
