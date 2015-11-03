#!/bin/bash
if [ ! -d "test/testfiles" ]; then
  cd test
  git clone https://github.com/yasp-dota/testfiles
  cd ..
else
  cd test/testfiles
  git clean -fxd
  git pull -f --all
  cd ../..
fi
npm run build
istanbul cover _mocha --report lcovonly -- -R spec
