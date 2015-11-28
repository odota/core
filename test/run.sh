#!/bin/bash
echo "NPM version: $(npm -v)"
echo "Node version: $(node -v)"
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
if [ -n "$TEST_INSTALL_GLOBAL" ]; then
  npm install istanbul -g
fi
if [ -z "$TEST_SKIP_BUILD" ]; then
  npm run build
fi
istanbul cover _mocha --report lcovonly -- -R spec
