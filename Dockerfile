FROM node:8.15-alpine

RUN mkdir -p /truffle-security

RUN apk --no-cache add git g++ gcc libgcc libstdc++ linux-headers make python jq pwgen

RUN npm i -g truffle --unsafe-perm

COPY . /truffle-security

RUN npm i -g /truffle-security --unsafe-perm

RUN mkdir /app

WORKDIR /app

ENTRYPOINT ["truffle", "run", "verify"]
