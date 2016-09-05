#!/bin/bash
echo "NPM version: $(npm -v)"
echo "Node version: $(node -v)"
istanbul cover _mocha --report lcovonly -- -R spec