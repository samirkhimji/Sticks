-- Run once after the initial drizzle migration (and safe to re-run any time).
-- Adds fuzzy-search support: trigram indexes so ILIKE '%...%' / similarity()
-- queries on names and titles stay fast as the catalog grows, and full text
-- search vectors for ranked multi-word queries.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS artists_name_trgm_idx ON artists USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS artist_aliases_trgm_idx ON artist_aliases USING gin (normalized_alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tracks_title_trgm_idx ON tracks USING gin (normalized_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS track_aliases_trgm_idx ON track_aliases USING gin (normalized_alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS djs_name_trgm_idx ON djs USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS dj_aliases_trgm_idx ON dj_aliases USING gin (normalized_alias gin_trgm_ops);
