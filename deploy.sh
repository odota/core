#!/bin/bash


if (( EUID != 0 )); then
   echo "You must be root to do this." 1>&2
   exit 100
fi

git pull origin master

npm install

mvn -f parser/pom.xml package

nf export -o /etc/init/

restart foreman
