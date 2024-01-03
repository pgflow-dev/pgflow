-- postgres table 'documents' with columns:
-- uid uuid, created_at timestampwithtz, content text, embeddings vector(768)
create table documents (
  uid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  content text NOT NULL,
  embeddings tsvector
);
