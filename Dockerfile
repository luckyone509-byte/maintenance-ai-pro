FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /app/data
ENV MAINT_AI_HOST=0.0.0.0 MAINT_AI_PORT=8080 MAINT_AI_DB=/app/data/maintenance_ai.db
EXPOSE 8080
CMD ["python","server.py"]
