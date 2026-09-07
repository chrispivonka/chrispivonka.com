FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY relay.sh /relay.sh
RUN chmod +x /relay.sh

ENTRYPOINT ["/relay.sh"]
