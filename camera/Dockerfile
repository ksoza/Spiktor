FROM python:3.11-slim

WORKDIR /app

# System libs required by opencv-python-headless and mediapipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

COPY camera/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY camera/service.py .

# YOLO11n weights are downloaded on first run by ultralytics if not present.
# ccap (CameraCapture) hardware lib is optional — service.py falls back to
# OpenCV VideoCapture if /usr/local/lib/libccap.so is not mounted (see
# docker-compose.yml camera-eyes volumes).

EXPOSE 5002
CMD ["python", "-m", "uvicorn", "service:app", "--host", "0.0.0.0", "--port", "5002"]
