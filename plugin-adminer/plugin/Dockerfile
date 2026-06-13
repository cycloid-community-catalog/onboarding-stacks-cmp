# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends php-cli curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /plugin

COPY manifest.yaml widgets.yaml package.json server.ts start.sh adminer-router.php ./

RUN curl -fsSL -o /plugin/adminer.php \
      https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1.php \
    && test -f /plugin/manifest.yaml \
    && test -f /plugin/widgets.yaml \
    && test -f /plugin/adminer.php \
    && chmod +x /plugin/start.sh

ENV PORT=8080
ENV ADMINER_PORT=8081
EXPOSE 8080

ENTRYPOINT ["/plugin/start.sh"]
