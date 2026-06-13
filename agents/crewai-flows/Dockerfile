FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY src/ ./src/
COPY server.py .

RUN pip install --no-cache-dir -e .
RUN pip install --no-cache-dir fastapi uvicorn

ENV PYTHONPATH=/app/src
EXPOSE 5006

CMD ["python", "server.py"]
