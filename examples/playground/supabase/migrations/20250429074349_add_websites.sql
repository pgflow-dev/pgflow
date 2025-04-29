CREATE TABLE public.websites (
  id SERIAL PRIMARY KEY,
  website_url TEXT NOT NULL,
  sentiment FLOAT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_websites_url ON public.websites(website_url);
