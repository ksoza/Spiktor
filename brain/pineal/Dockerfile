FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*

# Python deps
COPY brain/pineal/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY brain/ ./brain/
COPY guardrails/ ./guardrails/

# FastAPI wrapper around synthesis engine
COPY brain/pineal/server.py .

EXPOSE 5000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]
