FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY publish-to-s3.py .

# Local history/state persists across restarts via a mounted volume — see
# docker-compose.yml (STATE_FILE_PATH points inside /data).
RUN mkdir -p /data
ENV STATE_FILE_PATH=/data/.bambu-publisher-state.json

ENTRYPOINT ["python3", "publish-to-s3.py"]
