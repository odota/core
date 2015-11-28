FROM phusion/baseimage:0.9.17
# install git/maven/node
RUN apt-get update && apt-get install git maven openjdk-7-jdk -y
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
WORKDIR /usr/src/yasp
# install node/npm
ENV NODE_VERSION 5.1.0
RUN echo "" > /root/.bashrc && \
    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.29.0/install.sh | bash && \
    . /root/.bashrc && \
    nvm install $NODE_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use $NODE_VERSION && \
    npm install -g npm

# Just add package.json to get the NPM install cached.
ADD package.json /usr/src/yasp/
RUN . /root/.bashrc && npm install

# Add and build the java parser
ADD java_parser /usr/src/yasp/
RUN . /root/.bashrc && npm run maven

# Add and build webpack
ADD public /usr/src/yasp/
RUN . /root/.bashrc && npm run webpack

# Add everything else
ADD . /usr/src/yasp

ENTRYPOINT [ "/usr/src/yasp/docker_init.bash" ]
CMD [ "web.js" ]
