FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY publish-to-s3.py bambu_cloud_login.py .

# Local history/state (and, in cloud mode, the login token) persists across
# restarts via a mounted volume — see docker-compose.yml.
RUN mkdir -p /data
ENV STATE_FILE_PATH=/data/.bambu-publisher-state.json
ENV BAMBU_CLOUD_TOKEN_PATH=/data/.bambu-cloud-token.json

ENTRYPOINT ["python3", "publish-to-s3.py"]
