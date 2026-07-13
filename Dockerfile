# ── LendOS Dockerfile ──
# Build context must be the PROJECT ROOT (the folder that contains
# requirements.txt, backend/, and frontend/), not the backend/ folder
# itself — this matters because main.py's FRONTEND_DIR path relies on
# that relative structure being preserved exactly as it is locally.

FROM python:3.11-slim

WORKDIR /app

# System packages needed to build common Python DB/PDF/image libraries —
# matches your OCR/bank-statement/salary-slip parsing stack (pytesseract,
# pikepdf, PyMuPDF).
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    poppler-utils \
    tesseract-ocr \
    qpdf \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first — copied separately so Docker caches
# this layer and doesn't reinstall everything on every code change.
# requirements.txt lives at the PROJECT ROOT in your repo, not inside
# backend/ — this was the actual bug in the previous version.
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --default-timeout=200 --retries 10 \
    -r requirements.txt \
    -i https://pypi.org/simple

# Now copy the actual project, preserving the backend/ + frontend/ sibling
# layout that main.py's relative path logic depends on.
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

EXPOSE 8000

# Shell form (not exec array form) so $PORT expands correctly — Render/
# Railway inject PORT at runtime; locally it falls back to 8000.
# --workers 1 is REQUIRED: APScheduler runs in-process. Multiple workers
# would each independently run the daily EMI job — duplicate late-fee
# emails, EMIs double-charged. Do not remove this without moving the
# scheduler to a separate process first.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1