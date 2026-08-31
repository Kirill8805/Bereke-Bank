ALTER TABLE public.chat_sessions ALTER COLUMN score TYPE numeric(4,1) USING (score::numeric / 2);
ALTER TABLE public.profiles ALTER COLUMN rating TYPE numeric(6,1) USING (rating::numeric / 2);