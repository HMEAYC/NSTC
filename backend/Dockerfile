FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.30.0" \
    "websockets>=13.0" \
    "sqlalchemy>=2.0" \
    "psycopg2-binary>=2.9" \
    "asyncpg>=0.30.0" \
    "alembic>=1.13.0" \
    "pydantic>=2.0" \
    "pydantic-settings>=2.0" \
    "httpx>=0.27.0" \
    "python-multipart>=0.0.9" \
    "python-jose[cryptography]>=3.3.0" \
    "passlib[bcrypt]>=1.7.4"

COPY app/ app/
RUN pip install --no-cache-dir --no-deps .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
