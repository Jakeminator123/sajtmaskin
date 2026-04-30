FROM node:22.22.2-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends git sudo ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
