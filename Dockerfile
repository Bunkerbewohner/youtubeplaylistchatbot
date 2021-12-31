FROM node:15.6.0

RUN mkdir /opt/app
WORKDIR /opt/app

COPY ./package.json /opt/app/
COPY ./.credentials /opt/app/.credentials
RUN npm install

COPY . /opt/app/

CMD npm start
