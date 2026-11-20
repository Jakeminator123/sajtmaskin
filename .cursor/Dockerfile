FROM node:24.22.3-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends git sudo ca-certificates python3 python3-pip python3-venv make g++ \
  && rm -rf /var/lib/apt/lists/*
