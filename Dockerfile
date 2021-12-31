FROM node:17.1.0

ENV DISCORD_TOKEN=''
ENV YT_CREDENTIALS=''

RUN mkdir /opt/app
WORKDIR /opt/app

COPY ./package.json /opt/app/
RUN npm install --production

COPY . /opt/app/

CMD /opt/app/bin/start.sh
