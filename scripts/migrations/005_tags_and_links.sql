-- One-time delta migration. Run manually against the target Neon Postgres instance.
-- Adds tags (free-form labels for requests) and request_links (bidirectional
-- "related request" backlinks) to support cross-referencing on the Brain dashboard.

CREATE TABLE tags (
   id    serial PRIMARY KEY,
   -- name is stored lowercase; trim/lowercase normalization happens in the API layer, not the DB
   name  text NOT NULL UNIQUE
);

CREATE TABLE request_tags (
   request_id int NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
   tag_id     int NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
   PRIMARY KEY (request_id, tag_id)
);

-- Self-referential many-to-many table for bidirectional "related request" links.
-- A pair of requests is always stored as a single row with the lower id in
-- request_id_a; the CHECK constraint enforces this ordering (and rejects self-links).
-- The API layer must normalize operand order on every write since the DB won't reorder for you.
CREATE TABLE request_links (
   request_id_a int NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
   request_id_b int NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
   created_date  date NOT NULL DEFAULT CURRENT_DATE,
   CHECK (request_id_a < request_id_b),
   PRIMARY KEY (request_id_a, request_id_b)
);

CREATE INDEX idx_request_tags_tag_id ON request_tags(tag_id);
CREATE INDEX idx_request_links_b ON request_links(request_id_b);
