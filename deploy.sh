#!/bin/bash
git pull origin master
git submodule update --init

if (( EUID != 0 )); then
   echo "You must be root to do this." 1>&2
   exit 100
fi

npm install --production && npm run build

nf export web=1,worker=1,parser=1 -o /etc/init/

restart foreman
