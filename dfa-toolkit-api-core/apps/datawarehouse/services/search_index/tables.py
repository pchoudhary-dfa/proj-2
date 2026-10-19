from __future__ import annotations

from sqlalchemy import BigInteger, Column, MetaData, String, Table

# SQLAlchemy Core table definitions for search_* tables (no migrations/models in scope here).
# Authoritative DDL: apps/app_db/SQL/schema_search_mysql.sql (MySQL); PostgreSQL uses the same
# file via adapt_mysql_to_postgresql. We define only the columns needed for reads/writes.

metadata = MetaData()


search_keywords = Table(
    "search_keywords",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("keyword_type", String(32), nullable=False),
    Column("language_code", String(3), nullable=False),
    Column("canonical_text", String(255), nullable=False),
    Column("normalized_text", String(255), nullable=False),
    Column("entity_id", BigInteger, nullable=False),
)


search_keyword_synonym = Table(
    "search_keyword_synonym",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("keyword_id", BigInteger, nullable=False),
    Column("language_code", String(3), nullable=False),
    Column("synonym_text", String(255), nullable=False),
    Column("normalized_synonym", String(255), nullable=False),
    Column("synonym_type", String(32), nullable=False),
)


search_keyword_ngram = Table(
    "search_keyword_ngram",
    metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("keyword_id", BigInteger, nullable=False),
    Column("ngram", String(10), nullable=False),
)

