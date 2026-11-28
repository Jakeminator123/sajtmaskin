FROM python:3.12-slim
WORKDIR /app
ENV ALINA_HOSTED=1 ALINA_DATA_DIR=/workspace/alina ALINA_MONTHLY_STOP_USD=200 PORT=8000 PYTHONDONTWRITEBYTECODE=1
COPY scripts/alina/requirements.txt scripts/alina/
RUN pip install --no-cache-dir -r scripts/alina/requirements.txt
COPY scripts/alina/server.py scripts/alina/compose.py scripts/alina/cloud.py scripts/alina/trial_api.py scripts/alina/voice.py scripts/alina/provider_config.py scripts/alina/diagnostics.py scripts/alina/
COPY scripts/alina/worker/ scripts/alina/worker/
COPY public/video/aida/presenter-v2/TAL/alina-a1-talbas.mp4 public/video/aida/presenter-v2/TAL/alina-a1-mun-kake.png public/video/aida/presenter-v2/TAL/valkommen.mp4 public/video/aida/presenter-v2/TAL/
EXPOSE 8000
CMD ["python", "-u", "scripts/alina/server.py"]
