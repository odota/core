#!/bin/bash
sudo docker run -d --restart=always --net=host yasp/yasp:latest "node parser.js"
sudo docker run -d --restart=always --net=host yasp/yasp:latest "node parser.js"