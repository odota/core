FROM phusion/baseimage:0.9.17

RUN apt-get update && apt-get install git -y
WORKDIR /usr/src/yasp
ENV NODE_VERSION 5.1.0
RUN echo "" > /root/.bashrc && \
    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.29.0/install.sh | bash && \
    . /root/.bashrc && \
    nvm install $NODE_VERSION && \
    nvm alias default $NODE_VERSION && \
    nvm use $NODE_VERSION && \
    npm install -g npm
ADD package.json /usr/src/yasp/
RUN . /root/.bashrc && npm install
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Now that the npm install is cached add everything
ADD . /usr/src/yasp
ENTRYPOINT [ "/usr/src/yasp/docker_init.bash" ]
CMD [ "web.js" ]
