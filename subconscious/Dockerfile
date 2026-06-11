FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl git build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Rust (needed for turbovec if building from source)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"

COPY subconscious/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Try to install turbovec (from ksoza/turbovec submodule)
COPY turbovec/ ./turbovec-src/
RUN cd turbovec-src && pip install . --no-cache-dir 2>/dev/null || \
    echo "turbovec build skipped — numpy fallback active"

COPY subconscious/ ./subconscious/

RUN mkdir -p /app/data/turbovec

EXPOSE 5004
CMD ["python", "-m", "uvicorn", "subconscious.server:app", "--host", "0.0.0.0", "--port", "5004", "--workers", "1"]
