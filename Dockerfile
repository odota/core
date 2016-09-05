FROM node:6.5.0

ENV NPM_CONFIG_LOGLEVEL warn

WORKDIR /usr/src/yasp

ADD package.json /usr/src/yasp
RUN npm install

ADD . /usr/src/yasp
RUN npm run webpack

ENV PATH /usr/src/yasp/node_modules/pm2/bin:$PATH

CMD [ "npm", "start" ]
