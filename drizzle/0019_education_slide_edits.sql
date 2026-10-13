-- Restored schema already present in production. Do not reapply to the live DB.
CREATE TABLE IF NOT EXISTS edu_slide_edits (
  course_id text NOT NULL,
  level text NOT NULL,
  slide_id text NOT NULL,
  source_hash text NOT NULL,
  slide_json text NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  updated_by integer NOT NULL REFERENCES staff(id),
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY(course_id, level, slide_id)
);
