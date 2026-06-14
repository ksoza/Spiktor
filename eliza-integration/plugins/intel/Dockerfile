FROM python:3.11-slim

WORKDIR /app

COPY eliza-integration/plugins/intel/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY eliza-integration/plugins/intel/news_market_intel.py .

EXPOSE 5003
CMD ["python", "-m", "uvicorn", "news_market_intel:app", "--host", "0.0.0.0", "--port", "5003"]
