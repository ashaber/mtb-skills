# Cloud Run image for the mtb-skills backend (Phase 3.0 skeleton).
#
# Layout inside the image mirrors the repo layout, same convention as
# swim-coach/backend/Dockerfile:
#
#   /app/backend/...   (this package, WORKDIR)
#
# Unlike swim-coach, this backend has no athlete/library data trees to copy
# in -- it's a thin API in front of Supabase Postgres (accessed over the
# network via DATABASE_URL), so the image only needs backend/.
#
# Build context is the REPO ROOT (mirrors swim-coach):
#   docker build -f backend/Dockerfile .

FROM python:3.12-slim

# Non-root user per Andrew's global container standard.
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/app /app/backend/app

RUN chown -R app:app /app
USER app

WORKDIR /app/backend

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
