FROM python:3.11-slim

# libreoffice-impress: PDF/one-pager export shells out to `soffice --headless`
# (libreoffice-core alone ships no import/export filters — see README).
# playwright's chromium + its own apt deps: Workflow 2 (URL import) renders
# listing pages with a real browser before parsing them.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pinned explicitly rather than left to Playwright's default (~/.cache/ms-playwright):
# some PaaS runtimes (seen on Railway) inject their own PLAYWRIGHT_BROWSERS_PATH into
# the container at runtime without it being set during `docker build`, so the browser
# installed here ends up at a different path than where the app looks for it at
# runtime ("Failed to launch chromium because executable doesn't exist at ...").
# Setting it before `playwright install` makes build time and run time agree
# regardless of what the platform does or doesn't inject later.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install --with-deps chromium

COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Railway assigns the listen port via $PORT at runtime (not always 8000),
# so the port must be resolved in a shell rather than baked into exec-form CMD.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
