# Multi-stage build optimized for ARM64
FROM python:3.11-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip wheel
RUN pip install --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Runtime system deps: mysqldump is required by DW SQL dump export.
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Environment variables with defaults
ENV PROJECT_NAME="DFA Toolkit API Core" \
    VERSION="0.1.0" \
    CORS_ORIGINS='["http://localhost:3000","https://localhost:3001","https://localhost:3002","http://localhost:8000","https://visualizer.dfa6.dataforall.org"]' \
    ACCESS_TOKEN_EXPIRE_MINUTES="10" \
    LOG_LEVEL="INFO" \
    AVAILABLE_LANGUAGES="en,ar,fr" \
    DATAWAREHOUSES_BASE_PATH="dw" \
    DB_HOST="10.0.1.234" \
    DB_PORT="3306" \
    DB_NAME="csf-prod-fastapi-26-dtk_restapi" \
    DB_USER="csfdba" \
    DB_PASSWORD="" \
    DB_ECHO="False" \
    DB_POOL_SIZE="5" \
    DB_MAX_OVERFLOW="10" \
    INDICATOR_RESPONSE_FIELDS="" \
    REDIS_HOST="redis://redis.redis.svc.cluster.local:6379" \
    REDIS_PORT="6379" \
    REDIS_PASSWORD="" \
    REDIS_DB="0" \
    REDIS_DECODE_RESPONSES="true" \
    REDIS_SOCKET_TIMEOUT="5" \
    REDIS_SOCKET_CONNECT_TIMEOUT="5" \
    REDIS_MAX_CONNECTIONS="50" \
    BG_JOB_MQ_TYPE="DB" \
    BG_JOB_POLLER_ENABLED="true" \
    BG_JOB_POLL_INTERVAL_SEC="5" \
    BG_JOB_POLL_BATCH_SIZE="10" \
    BG_JOB_STALE_LEASE_SEC="1800" \
    CELERY_QUEUE_NAME_ISMRD="dfa_dw_ismrd" \
    CELERY_QUEUE_NAME_SUBGROUP_UPDATE="dfa_dw_subgroup_update" \
    IS_BACKGROUND_ENABLED="true" \
    CELERY_QUEUE_NAME_DEFAULT_SUBGROUP="dfa_dw_default_subgroup" \
    DEFAULT_SUBGROUP_SYNC_MAX_IUS_ROWS="1000" \
    DEFAULT_SUBGROUP_SYNC_MAX_IU_PAIRS="1000" \
    DFA_SEND_MODE="auto" \
    DFA_DM_FED_ORIGIN_URL="" \
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES="60"
WORKDIR /app
COPY . .

# Clear Python cache to ensure fresh code
RUN find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
RUN find . -type f -name "*.pyc" -delete 2>/dev/null || true

# Make entrypoint script executable
RUN chmod +x /app/docker/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/docker/entrypoint.sh"]

# Gunicorn + Uvicorn workers for production (UAT/PRD). Log to stdout/stderr for K8s.
CMD ["gunicorn", "main:app", "-c", "gunicorn_conf.py", "-k", "uvicorn.workers.UvicornWorker", "--access-logfile", "-", "--error-logfile", "-"]
