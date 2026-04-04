# FAQ Embeddings Technical Document

## Purpose

This document explains how the project currently uses embeddings for FAQ retrieval, how database schema changes are handled today, and what we should do next to make search faster and more production-ready.

## Current Architecture

The FAQ search flow is based on semantic retrieval:

1. FAQ data is loaded from `general_questions.json` and `general_answers.json`.
2. Each FAQ question is converted into a vector embedding using Gemini.
3. The embedding is stored in PostgreSQL in the `faqs` table.
4. When a user asks a new question, the app generates an embedding for the query.
5. The query embedding is compared against stored FAQ embeddings.
6. The closest FAQ is returned and its answers are shown in English, Russian, and Uzbek.

## Files Involved

- `populate_db.py`
  Builds document embeddings for FAQ entries and inserts them into the database.
- `db_manager.py`
  Creates the table, detects `pgvector` support, stores embeddings, and performs vector search.
- `test.py`
  Generates query embeddings and displays the best FAQ match in the desktop UI.
- `db_config.py`
  Reads PostgreSQL connection settings from environment variables.

## How Embeddings Are Generated

### FAQ Embeddings

FAQ embeddings are created in `populate_db.py` using:

- Model: `gemini-embedding-2-preview`
- Output dimensionality: `1536`
- Task type: `RETRIEVAL_DOCUMENT`

For each FAQ, the code combines the three language variants of the question into one structured text block:

```text
uz: ...
ru: ...
en: ...
```

This is a good design choice because it creates one multilingual semantic representation for the same FAQ intent.

### Query Embeddings

Search queries are embedded in `test.py` using:

- Model: `gemini-embedding-2-preview`
- Output dimensionality: `1536`
- Task type: `RETRIEVAL_QUERY`

This is also correct: documents use `RETRIEVAL_DOCUMENT`, while live user searches use `RETRIEVAL_QUERY`.

### Normalization

Both FAQ and query embeddings are normalized with NumPy before storage or comparison.

That matters because:

- cosine-style similarity works best on normalized vectors
- the Python fallback path explicitly computes cosine similarity
- normalized vectors make distance comparisons more stable

## Database Design

The main table is `faqs`:

```sql
CREATE TABLE IF NOT EXISTS faqs (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100),
    question_uz TEXT,
    question_ru TEXT,
    question_en TEXT,
    answer_uz TEXT,
    answer_ru TEXT,
    answer_en TEXT,
    vector_embedding VECTOR(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

If `pgvector` is not available, the code falls back to:

```sql
vector_embedding JSONB
```

This fallback keeps the system functional, but it is much slower because similarity search then happens in Python after loading records from the database.

## How Search Works Today

### Fast Path: PostgreSQL + pgvector

If `pgvector` exists and `vector_embedding` is really of type `vector`, the code runs:

```sql
SELECT *, (vector_embedding <=> %s) AS distance
FROM faqs
ORDER BY vector_embedding <=> %s
LIMIT %s;
```

This means PostgreSQL computes vector distance directly in SQL and returns the closest rows.

### Slow Path: Python Fallback

If `pgvector` is missing, the system:

1. loads all FAQs with `SELECT * FROM faqs`
2. converts the stored JSON embedding into NumPy arrays
3. calculates cosine similarity in Python
4. sorts all rows in memory

This works for a small dataset, but it will become slow as the FAQ table grows.

## Database Migrations: What We Have Today

Strictly speaking, the project does not currently use formal database migrations.

Instead, schema creation happens at runtime inside `DBManager.setup_database()`:

1. the app tries to run `CREATE EXTENSION IF NOT EXISTS vector;`
2. if that succeeds, it creates `faqs.vector_embedding` as `VECTOR(1536)`
3. if that fails, it creates `faqs.vector_embedding` as `JSONB`

This approach is simple and convenient for local development, but it is not a true migration strategy because:

- it does not track schema versions
- it does not record which changes were applied and when
- it makes production upgrades harder to audit
- it cannot safely evolve the schema over time in a controlled way

## Recommended Migration Strategy

We should move to versioned SQL or Alembic migrations.

### Migration 1: Enable pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Migration 2: Create the FAQ Table

```sql
CREATE TABLE IF NOT EXISTS faqs (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100),
    question_uz TEXT,
    question_ru TEXT,
    question_en TEXT,
    answer_uz TEXT,
    answer_ru TEXT,
    answer_en TEXT,
    vector_embedding VECTOR(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Migration 3: Add Basic B-Tree Indexes

These help for filtering and future admin operations:

```sql
CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category);
CREATE INDEX IF NOT EXISTS idx_faqs_created_at ON faqs(created_at);
```

### Migration 4: Add a Vector Index

For approximate nearest-neighbor search, add either `ivfflat` or `hnsw`.

`hnsw` is generally the better choice if supported by the installed pgvector version:

```sql
CREATE INDEX IF NOT EXISTS idx_faqs_embedding_hnsw
ON faqs
USING hnsw (vector_embedding vector_cosine_ops);
```

If `hnsw` is not available, use `ivfflat`:

```sql
CREATE INDEX IF NOT EXISTS idx_faqs_embedding_ivfflat
ON faqs
USING ivfflat (vector_embedding vector_cosine_ops)
WITH (lists = 100);
```

After creating an `ivfflat` index, run:

```sql
ANALYZE faqs;
```

### Migration 5: Add an Update Trigger for `updated_at`

Right now, `updated_at` is manually refreshed in some update queries. A trigger is safer:

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faqs_updated_at ON faqs;

CREATE TRIGGER trg_faqs_updated_at
BEFORE UPDATE ON faqs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
```

## If We Already Have JSONB Embeddings

If a database was initialized without `pgvector`, then `vector_embedding` may already be `JSONB`.

In that case, the migration path should be:

1. install the `vector` extension in PostgreSQL
2. add a new `VECTOR(1536)` column, for example `vector_embedding_new`
3. re-embed or convert and backfill data into the new vector column
4. validate search results
5. rename columns or replace the old one
6. create the vector index

Example outline:

```sql
ALTER TABLE faqs ADD COLUMN vector_embedding_new VECTOR(1536);
```

Backfill can then be done from Python by reading each JSON embedding and updating the new vector column.

## Why Search Is Fast or Slow in This Project

Search performance currently depends on three main factors:

### 1. Whether `pgvector` Is Installed

This is the biggest factor.

- with `pgvector`: vector distance is computed in PostgreSQL
- without `pgvector`: every search becomes a full scan in Python

### 2. Whether There Is a Vector Index

The code currently performs vector ordering in SQL, but it does not create a dedicated vector index.

That means PostgreSQL may still scan many or all rows before sorting by distance.

For small datasets this is fine. For larger datasets, this becomes the main bottleneck.

### 3. Whether We Return Only What We Need

Current query:

```sql
SELECT *, (vector_embedding <=> %s) AS distance
FROM faqs
ORDER BY vector_embedding <=> %s
LIMIT %s;
```

This returns all columns, including large text fields, even though ranking only needs a subset.

We can improve this by ranking first, then fetching the full row only for the top results if needed.

## What We Should Do to Make Search Even Faster

The most important improvements are below, in priority order.

### 1. Require pgvector in Non-Development Environments

For production, we should not rely on the JSONB fallback.

Recommendation:

- keep JSONB fallback only for local experiments
- fail fast in staging and production if `pgvector` is missing

Without this, search quality may stay good, but latency will degrade quickly as data grows.

### 2. Create a Vector Index

Add an `hnsw` or `ivfflat` index on `vector_embedding`.

This is the biggest database-side speed improvement.

Recommendation:

- prefer `hnsw` when available
- otherwise use `ivfflat`
- tune `lists` for dataset size if using `ivfflat`

### 3. Keep Cosine Distance Consistent

Because embeddings are normalized, cosine distance is the right operator family.

Use:

- `vector_cosine_ops`
- the same normalization logic for both documents and queries

This keeps rankings consistent and avoids unnecessary recall loss.

### 4. Add Category Prefiltering When Possible

If the application can infer or ask for a category first, search becomes cheaper:

```sql
SELECT id, category, answer_en, answer_ru, answer_uz,
       (vector_embedding <=> %s) AS distance
FROM faqs
WHERE category = %s
ORDER BY vector_embedding <=> %s
LIMIT %s;
```

This reduces the candidate set before vector ranking.

### 5. Retrieve Top-K, Then Apply a Relevance Threshold

Instead of always taking the single nearest row, retrieve the top few results:

- `LIMIT 3` or `LIMIT 5`
- reject weak matches using a maximum distance threshold

Benefits:

- better quality control
- room for reranking
- safer behavior when no FAQ is truly relevant

### 6. Avoid `SELECT *` During Ranking

Rank with a lighter query first:

```sql
SELECT id, (vector_embedding <=> %s) AS distance
FROM faqs
ORDER BY vector_embedding <=> %s
LIMIT %s;
```

Then fetch the selected FAQ rows by ID.

This reduces transfer cost and helps the planner work with smaller result payloads.

### 7. Cache Query Embeddings

If users ask the same or very similar questions repeatedly, cache query embeddings in memory or Redis.

That avoids repeated embedding API calls, which can dominate total response time even if database search is fast.

### 8. Batch FAQ Embedding During Imports

The current import process embeds one FAQ at a time and waits based on RPM.

For faster ingestion:

- batch multiple FAQ texts per embedding request if the API path allows it
- separate ingestion speed concerns from search speed concerns
- keep embeddings generation offline, not during user search

This does not improve single-query retrieval latency directly, but it speeds up indexing and reindexing.

### 9. Consider Splitting Search Text From Display Content

Right now, embeddings are built from multilingual question text only.

Possible improvement:

- store a dedicated searchable text field such as `search_text`
- include category and short answer keywords when helpful
- keep display fields separate from retrieval fields

This can improve both relevance and maintainability.

### 10. Add Monitoring and Explain Plans

Once indexing is added, we should validate with:

```sql
EXPLAIN ANALYZE
SELECT id, (vector_embedding <=> '[...]') AS distance
FROM faqs
ORDER BY vector_embedding <=> '[...]'
LIMIT 5;
```

This confirms whether PostgreSQL is using the intended vector index.

## Suggested Production Query Pattern

For a more scalable search flow:

1. generate a normalized query embedding
2. search top 5 FAQ IDs using vector index
3. reject matches above a distance threshold
4. optionally rerank the small candidate set
5. return the best answer

This pattern gives better performance and more control than immediately taking `LIMIT 1`.

## Recommended Next Steps

### Short Term

- keep current architecture
- add versioned migration scripts
- require `pgvector` for real environments
- create a vector index
- add a relevance threshold

### Medium Term

- optimize the SQL query to avoid `SELECT *`
- add category prefiltering
- cache query embeddings
- test `hnsw` versus `ivfflat`

### Long Term

- move from runtime schema setup to proper migration tooling such as Alembic
- add evaluation datasets for recall and latency
- consider hybrid search if keyword matching becomes important

## Summary

The current system already follows the right retrieval pattern:

- document embeddings for FAQs
- query embeddings for user questions
- normalized vectors
- multilingual FAQ representation

The main limitation is not embedding quality. It is database maturity.

Today, schema changes are handled dynamically in application code, and search speed depends too much on whether `pgvector` happens to be installed. To make the system faster and safer, we should formalize migrations, require `pgvector`, and add a vector index on `faqs.vector_embedding`.
