
-- Waiting pool
CREATE TABLE public.waiting_pool (
  user_id text PRIMARY KEY,
  pseudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_pool TO anon, authenticated;
GRANT ALL ON public.waiting_pool TO service_role;
ALTER TABLE public.waiting_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read waiting" ON public.waiting_pool FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert waiting" ON public.waiting_pool FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public delete waiting" ON public.waiting_pool FOR DELETE TO anon, authenticated USING (true);

-- Chat sessions
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a text NOT NULL,
  pseudo_a text NOT NULL,
  user_b text NOT NULL,
  pseudo_b text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  ended_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO anon, authenticated;
GRANT ALL ON public.chat_sessions TO service_role;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read sessions" ON public.chat_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert sessions" ON public.chat_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update sessions" ON public.chat_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  sender_pseudo text NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.messages(session_id, created_at);
GRANT SELECT, INSERT ON public.messages TO anon, authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read messages" ON public.messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert messages" ON public.messages FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_sessions REPLICA IDENTITY FULL;

-- Matchmaking function
CREATE OR REPLACE FUNCTION public.find_or_create_match(p_user_id text, p_pseudo text)
RETURNS TABLE(session_id uuid, partner_pseudo text, is_initiator boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner record;
  v_session_id uuid;
BEGIN
  -- Clean stale waiting entries (older than 5 minutes)
  DELETE FROM public.waiting_pool WHERE created_at < now() - interval '5 minutes';

  -- Remove self from any prior wait
  DELETE FROM public.waiting_pool WHERE user_id = p_user_id;

  -- Try to grab someone else waiting
  SELECT * INTO v_partner
  FROM public.waiting_pool
  WHERE user_id <> p_user_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    DELETE FROM public.waiting_pool WHERE user_id = v_partner.user_id;
    INSERT INTO public.chat_sessions (user_a, pseudo_a, user_b, pseudo_b)
    VALUES (v_partner.user_id, v_partner.pseudo, p_user_id, p_pseudo)
    RETURNING id INTO v_session_id;
    RETURN QUERY SELECT v_session_id, v_partner.pseudo, true;
  ELSE
    INSERT INTO public.waiting_pool (user_id, pseudo) VALUES (p_user_id, p_pseudo);
    RETURN QUERY SELECT NULL::uuid, NULL::text, false;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.find_or_create_match(text, text) TO anon, authenticated;

-- End session
CREATE OR REPLACE FUNCTION public.end_session(p_session_id uuid, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_sessions
  SET status = 'ended', ended_at = now(), ended_by = p_user_id
  WHERE id = p_session_id AND status = 'active';
END;
$$;
GRANT EXECUTE ON FUNCTION public.end_session(uuid, text) TO anon, authenticated;

-- Cancel wait
CREATE OR REPLACE FUNCTION public.cancel_wait(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.waiting_pool WHERE user_id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_wait(text) TO anon, authenticated;
