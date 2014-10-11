#!/bin/bash


if (( EUID != 0 )); then
   echo "You must be root to do this." 1>&2
   exit 100
fi

npm install

nf export -o /etc/init/

start foreman
