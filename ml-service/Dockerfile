# FastAPI + XGBoost API image. Build from the REPO ROOT so the training data
# is in the build context:
#   docker build -f ml-service/Dockerfile -t naiserve-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/ml-service

COPY ml-service/requirements-api.txt .
RUN pip install --no-cache-dir --default-timeout=120 --retries 5 -r requirements-api.txt

COPY data/raw /app/data/raw
COPY ml-service/api.py ml-service/feature_engineering.py ml-service/finalize_model.py ./

# The .pkl is gitignored, so train it here. finalize_model.py is
# deterministic (random_state=42) and only uses the 5 pre-outcome features.
RUN mkdir -p models && python finalize_model.py

# Render (and most hosts) inject $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
