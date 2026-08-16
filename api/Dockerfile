FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Train + validate the uplift model at build time. The training script asserts
# the model ranks uplift better than random, so a degenerate model fails the
# build rather than shipping. Produces models/artifacts/uplift_slearner.joblib.
RUN python train_uplift.py

EXPOSE 8100

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "2"]
