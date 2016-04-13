# Settings and base image.
# For possible NODE_VERSION values,
# install nvm and run "nvm ls-remote"
FROM phusion/baseimage:0.9.17
# install git/java
# if building, need jdk and maven
RUN add-apt-repository ppa:openjdk-r/ppa && \
    apt-get update && \
    apt-get install -y git openjdk-8-jdk maven build-essential && \
    apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
WORKDIR /usr/src/yasp
ENV NODE_VERSION 5.8.0
RUN echo "" > /root/.bashrc && \
    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.29.0/install.sh | bash && \
    . /root/.bashrc && \
    nvm install $NODE_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use $NODE_VERSION && \
    npm install -g npm

RUN update-alternatives --install "/usr/bin/java" "java" "/usr/lib/jvm/java-8-openjdk-amd64/bin/java" 1
RUN update-alternatives --set java /usr/lib/jvm/java-8-openjdk-amd64/bin/java

# Just add package.json to get the NPM install cached.
ADD package.json /usr/src/yasp/
RUN . /root/.bashrc && npm install

# Add and build the java parser
ADD java_parser /usr/src/yasp/java_parser
RUN . /root/.bashrc && npm run maven

# Add everything else
ADD . /usr/src/yasp
RUN . /root/.bashrc && npm run webpack

ENTRYPOINT [ "/usr/src/yasp/docker_init.bash" ]
CMD [ "node deploy.js" ]