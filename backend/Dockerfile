FROM python:3.11-slim

# libreoffice-impress: PDF/one-pager export shells out to `soffice --headless`
# (libreoffice-core alone ships no import/export filters — see README).
# playwright's chromium + its own apt deps: Workflow 2 (URL import) renders
# listing pages with a real browser before parsing them.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium

COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Railway assigns the listen port via $PORT at runtime (not always 8000),
# so the port must be resolved in a shell rather than baked into exec-form CMD.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
