FROM python:3.11-slim

WORKDIR /app

COPY apps/api/requirements.txt /app/apps/api/requirements.txt
RUN pip install --no-cache-dir -r /app/apps/api/requirements.txt

COPY packages/domain /app/packages/domain
COPY packages/data_adapters /app/packages/data_adapters
COPY apps/api /app/apps/api

ENV PYTHONPATH="/app/packages/domain/src:/app/packages/data_adapters/src:/app/apps/api/src"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/v1/ops/health')" || exit 1

CMD ["uvicorn", "airsense_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
