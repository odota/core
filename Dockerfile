FROM mhart/alpine-node:5.10.1

RUN apk update && apk add git bash curl openjdk8

# Dependencies for native modules
#RUN apk update && apk add make gcc g++ python

# maven not available in mainline apk yet
# https://pkgs.alpinelinux.org/package/edge/testing/x86_64/maven
#https://github.com/nitram509/docker-alpine-oraclejdk8-maven-cmake-gcc/blob/master/Dockerfile
ENV MAVEN_HOME="/usr/share/maven"
ENV MAVEN_VERSION="3.3.9"
RUN cd / && \
    wget -q "http://archive.apache.org/dist/maven/maven-3/$MAVEN_VERSION/binaries/apache-maven-$MAVEN_VERSION-bin.tar.gz" -O - | tar xvzf - && \
    mv /apache-maven-$MAVEN_VERSION /usr/share/maven && \
    ln -s /usr/share/maven/bin/mvn /usr/bin/mvn

WORKDIR /usr/src/yasp

# Add package.json to get the NPM install cached.
ADD package.json /usr/src/yasp/
RUN npm install

# Add and build the java parser
ADD java_parser /usr/src/yasp/java_parser
RUN npm run maven

# Add everything else
ADD . /usr/src/yasp
RUN npm run webpack

ENV PATH /usr/src/yasp/node_modules/pm2/bin:$PATH

ENTRYPOINT [ "/usr/src/yasp/docker_init.bash" ]

# Sleep
CMD [ "tail", "-f", "/dev/null" ]