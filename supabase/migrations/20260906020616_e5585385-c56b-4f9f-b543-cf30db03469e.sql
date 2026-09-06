CREATE TABLE public.game_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_type text NOT NULL DEFAULT 'Rodada Teste',
  current_week int NOT NULL DEFAULT 1,
  default_initial_stock int NOT NULL DEFAULT 20,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.player_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  role text NOT NULL,
  current_stock int NOT NULL DEFAULT 20,
  backlog int NOT NULL DEFAULT 0,
  incoming_order int NOT NULL DEFAULT 0,
  week_order int,
  is_joined boolean NOT NULL DEFAULT false,
  is_ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, role)
);

CREATE TABLE public.round_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_type text NOT NULL,
  brand text NOT NULL,
  role text NOT NULL,
  week int NOT NULL,
  demand_received int NOT NULL DEFAULT 0,
  order_placed int NOT NULL DEFAULT 0,
  final_stock int NOT NULL DEFAULT 0,
  final_backlog int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_config TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_sessions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_history TO anon, authenticated;
GRANT ALL ON public.game_config TO service_role;
GRANT ALL ON public.player_sessions TO service_role;
GRANT ALL ON public.round_history TO service_role;

ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classroom access game_config" ON public.game_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "classroom access player_sessions" ON public.player_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "classroom access round_history" ON public.round_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_sessions;

INSERT INTO public.game_config (round_type, current_week, default_initial_stock, status)
VALUES ('Rodada Teste', 1, 20, 'waiting');

INSERT INTO public.player_sessions (brand, role, current_stock, backlog, incoming_order)
SELECT b, r, 20, 0, 12
FROM unnest(ARRAY['Amstel','Budweiser','Heineken','Skol']) AS b
CROSS JOIN unnest(ARRAY['Fábrica','Distribuidor','Atacadista','Varejista']) AS r;