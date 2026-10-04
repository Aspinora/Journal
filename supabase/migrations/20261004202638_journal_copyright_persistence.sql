-- Nullable for legacy works: never invent a license the author did not choose.
ALTER TABLE public.journals ADD COLUMN IF NOT EXISTS copyright text;
ALTER TABLE public.journals ADD CONSTRAINT journals_copyright_valid
  CHECK (copyright IS NULL OR copyright IN (
    'exclusive','public-domain','by','by-nd','by-nc','by-nc-nd','by-sa','by-nc-sa'
  ));
