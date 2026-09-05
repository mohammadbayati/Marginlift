FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Train + validate the seed uplift model and self-check the registry/promotion
# gate at build time. A degenerate model or a broken promotion gate fails the
# build rather than shipping. Produces models/artifacts/uplift_slearner.joblib.
RUN python train_uplift.py && python -m mlops.selftest

EXPOSE 8100

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "2"]
