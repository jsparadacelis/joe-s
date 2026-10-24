# Imagen del backend para Cloud Run. El contexto de construcción es backend/. Ver docs/despliegue.md.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./backend

RUN useradd --system --no-create-home app
USER app

# Cloud Run inyecta PORT. Las migraciones no se aplican aquí: ver docs/despliegue.md.
CMD ["sh", "-c", "exec uvicorn backend.app.api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
