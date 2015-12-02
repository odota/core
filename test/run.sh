#!/bin/bash
echo "NPM version: $(npm -v)"
echo "Node version: $(node -v)"
if [ ! -d "test/testfiles" ]; then
  cd test
  if [ -n "$CI" ]; then
    git clone https://github.com/yasp-dota/testfiles --depth=1
  else
    git clone https://github.com/yasp-dota/testfiles
  fi
  cd ..
else
  cd test/testfiles
  git clean -fxd
  git pull -f --all
  cd ../..
fi

if [ -z "$TEST_SKIP_BUILD" ]; then
  npm run build
fi
istanbul cover _mocha --report lcovonly -- -R spec