# syntax=docker/dockerfile:1
FROM node:22-trixie-slim

WORKDIR /plugin

COPY package.json ./
RUN npm install --omit=dev

COPY manifest.yaml widgets.yaml schema.sql server.ts start.sh ./
RUN chmod +x /plugin/start.sh \
    && test -f /plugin/manifest.yaml \
    && test -f /plugin/widgets.yaml \
    && test -f /plugin/schema.sql

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/plugin/start.sh"]
