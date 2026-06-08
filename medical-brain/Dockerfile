# Python Backend Dockerfile - AI/ML Brain
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1001 pythonuser
USER pythonuser

EXPOSE 5000

ENV PYTHONUNBUFFERED=1
ENV API_PORT=5000
ENV API_HOST=0.0.0.0
ENV CHROMA_DB_PATH=./chroma_db
ENV BACKEND_URL=http://medical-backend:3001

CMD ["python", "main.py"]
