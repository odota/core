# Settings and base image.
# For possible NODE_VERSION values,
# install nvm and run "nvm ls-remote"
FROM phusion/baseimage:0.9.17
ENV NODE_VERSION 5.1.0

# install git/maven
RUN apt-get update && \
    apt-get install -y git maven openjdk-7-jdk && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /usr/src/yasp
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

# Now that the npm install is cached add everything
ADD . /usr/src/yasp

# Run the maven build and webpack build
RUN . /root/.bashrc && npm run maven && npm run webpack

ENTRYPOINT [ "/usr/src/yasp/docker_init.bash" ]
CMD [ "web.js" ]
