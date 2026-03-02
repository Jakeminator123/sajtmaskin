FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 \
    libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 libxshmfence1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install chromium --with-deps

COPY . .

RUN mkdir -p /app/runtime /app/results

ENV SKV_HEADLESS=y
ENV SKV_HOST=0.0.0.0
ENV CLONE_QR_FROMPLAYWRIGHT_TO_SITE=y

EXPOSE ${PORT:-8767}

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:${PORT:-8767}/api/health || exit 1

# Shell form so $PORT is expanded at runtime (Render sets PORT dynamically)
CMD gunicorn --bind "0.0.0.0:${PORT:-8767}" --workers 1 --threads 4 --timeout 600 skv6:app
