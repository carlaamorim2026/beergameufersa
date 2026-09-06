import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Beer,
  Boxes,
  Eye,
  Loader2,
  Lock,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  BRANDS,
  BRAND_ACCENT,
  ROLES,
  ROLE_DESCRIPTION,
  TOTAL_WEEKS,
  type Brand,
  type GameConfig,
  type PlayerSession,
  type Role,
} from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Beer Game Logístico — Simulação da Cadeia de Suprimentos" },
      {
        name: "description",
        content:
          "Participe do Beer Game Logístico: escolha sua cervejaria e seu elo da cadeia, faça pedidos semanais e veja o efeito chicote na prática.",
      },
      { property: "og:title", content: "Beer Game Logístico — Simulação da Cadeia de Suprimentos" },
      {
        property: "og:description",
        content:
          "Simulação em tempo real da cadeia de suprimentos para turmas de logística e produção.",
      },
    ],
  }),
  component: StudentApp,
});

const STORAGE_KEY = "beer-game-session";

function StudentApp() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [players, setPlayers] = useState<PlayerSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [cfg, ps] = await Promise.all([
      supabase.from("game_config").select("*").limit(1).maybeSingle(),
      supabase.from("player_sessions").select("*"),
    ]);
    if (cfg.data) setConfig(cfg.data as unknown as GameConfig);
    if (ps.data) setPlayers(ps.data as unknown as PlayerSession[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    setSessionId(localStorage.getItem(STORAGE_KEY));
    void refresh();
    const channel = supabase
      .channel("beer-game-student")
      .on("postgres_changes", { event: "*", schema: "public", table: "player_sessions" }, () =>
        void refresh(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "game_config" }, () =>
        void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const me = useMemo(
    () => players.find((p) => p.id === sessionId) ?? null,
    [players, sessionId],
  );

  const join = async (brand: Brand, role: Role) => {
    const target = players.find((p) => p.brand === brand && p.role === role);
    if (!target) return;
    await supabase.from("player_sessions").update({ is_joined: true }).eq("id", target.id);
    localStorage.setItem(STORAGE_KEY, target.id);
    setSessionId(target.id);
    void refresh();
  };

  const leave = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSessionId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {me && config ? (
        <GameScreen me={me} config={config} onLeave={leave} onRefresh={refresh} />
      ) : (
        <JoinScreen config={config} players={players} onJoin={join} />
      )}
      <footer className="flex items-center justify-center gap-2 pb-8 pt-4 text-xs text-muted-foreground">
        <Link to="/admin" aria-label="Área do instrutor" className="hover:text-foreground">
          <Lock className="h-4 w-4" />
        </Link>
        <span>Beer Game Logístico</span>
      </footer>
    </div>
  );
}

function JoinScreen({
  config,
  players,
  onJoin,
}: {
  config: GameConfig | null;
  players: PlayerSession[];
  onJoin: (brand: Brand, role: Role) => void;
}) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  const takenRoles = useMemo(
    () =>
      new Set(
        players.filter((p) => p.brand === brand && p.is_joined).map((p) => p.role as string),
      ),
    [players, brand],
  );

  return (
    <div className="mx-auto max-w-lg px-5 pb-10 pt-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Beer className="h-6 w-6 text-primary" />
            Beer Game Logístico
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rodada ativa:{" "}
            <span className="font-semibold text-foreground">
              {config?.round_type ?? "—"}
            </span>
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          1. Escolha sua cervejaria
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                setBrand(b);
                setRole(null);
              }}
              className={`rounded-2xl border p-4 text-left transition-all ${
                brand === b
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-border hover:border-primary/50"
              } bg-card`}
            >
              <div
                className={`mb-3 h-10 w-10 rounded-xl bg-gradient-to-br ${BRAND_ACCENT[b]}`}
                aria-hidden
              />
              <span className="font-semibold">{b}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          2. Escolha seu elo da cadeia
        </h2>
        <div className="space-y-3">
          {ROLES.map((r) => {
            const disabled = !brand || takenRoles.has(r);
            return (
              <button
                key={r}
                type="button"
                disabled={disabled}
                onClick={() => setRole(r)}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                  role === r ? "border-primary ring-2 ring-primary/40" : "border-border"
                } bg-card disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{r}</span>
                  {takenRoles.has(r) && brand && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Ocupado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</p>
              </button>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        disabled={!brand || !role}
        onClick={() => brand && role && onJoin(brand, role)}
        className="w-full rounded-2xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
      >
        Entrar na Partida
      </button>
    </div>
  );
}

function GameScreen({
  me,
  config,
  onLeave,
  onRefresh,
}: {
  me: PlayerSession;
  config: GameConfig;
  onLeave: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [orderInput, setOrderInput] = useState<string>(String(me.week_order ?? ""));
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRevealed(false);
    setOrderInput(me.week_order ? String(me.week_order) : "");
  }, [config.current_week]);

  const parsed = Number(orderInput);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 40;

  const saveOrder = async () => {
    if (!valid) {
      setMessage("Informe um pedido entre 1 e 40 paletes.");
      return;
    }
    setSaving(true);
    await supabase.from("player_sessions").update({ week_order: parsed }).eq("id", me.id);
    setSaving(false);
    setMessage("Pedido salvo. Você ainda pode alterar antes de encerrar a rodada.");
    void onRefresh();
  };

  const finishRound = async () => {
    if (!valid) {
      setMessage("Faça um pedido válido antes de encerrar a rodada.");
      return;
    }
    setSaving(true);
    await supabase
      .from("player_sessions")
      .update({ week_order: parsed, is_ready: true })
      .eq("id", me.id);
    setSaving(false);
    setMessage(null);
    void onRefresh();
  };

  const finished = config.status === "finished" || config.current_week > TOTAL_WEEKS;

  return (
    <div className="mx-auto max-w-lg px-5 pb-10 pt-5">
      <header className="sticky top-0 z-10 -mx-5 mb-5 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-5 pb-3 pt-2 backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-6 w-6 shrink-0 rounded-lg bg-gradient-to-br ${BRAND_ACCENT[me.brand]}`}
              aria-hidden
            />
            <p className="truncate text-sm font-bold">
              {me.brand} · {me.role}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Semana {Math.min(config.current_week, TOTAL_WEEKS)} de {TOTAL_WEEKS} ·{" "}
            {config.round_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onLeave}
            aria-label="Sair do posto"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Boxes className="h-4 w-4" /> Estoque atual
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {me.current_stock}
          </p>
          <p className="text-xs text-muted-foreground">paletes no armazém</p>
        </div>
        <div
          className={`rounded-2xl border p-4 ${
            me.backlog > 0
              ? "border-red-500/60 bg-red-50 dark:bg-red-950/40"
              : "border-border bg-card"
          }`}
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <TriangleAlert className="h-4 w-4" /> Dívida / Backlog
          </div>
          <p
            className={`text-3xl font-bold ${
              me.backlog > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
            }`}
          >
            {me.backlog}
          </p>
          <p className="text-xs text-muted-foreground">paletes devidos</p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Pedido recebido da rodada</p>
            <p className="text-xs text-muted-foreground/80">
              {me.role === "Varejista"
                ? "Demanda do cliente final"
                : `Pedido do ${me.role === "Fábrica" ? "Distribuidor" : me.role === "Distribuidor" ? "Atacadista" : "Varejista"}`}
            </p>
          </div>
          {revealed ? (
            <p className="text-3xl font-bold">{me.incoming_order}</p>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground"
            >
              <Eye className="h-4 w-4" /> Olhar Pedido
            </button>
          )}
        </div>
      </div>

      {finished ? (
        <div className="mt-5 rounded-2xl border border-border bg-card p-6 text-center">
          <PackageCheck className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          <p className="font-semibold">Jogo encerrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Aguarde as análises do instrutor.
          </p>
        </div>
      ) : me.is_ready ? (
        <div className="mt-5 rounded-2xl border border-border bg-card p-6 text-center">
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
          <p className="font-semibold">Rodada encerrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pedido de <span className="font-semibold text-foreground">{me.week_order}</span>{" "}
            paletes registrado. Aguardando o instrutor avançar a semana.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <label htmlFor="pedido" className="block text-sm font-semibold">
            Pedido de Paletes (1 a 40)
          </label>
          <input
            id="pedido"
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            value={orderInput}
            onChange={(e) => setOrderInput(e.target.value)}
            className="w-full rounded-2xl border border-input bg-card px-4 py-4 text-center text-3xl font-bold outline-none focus:border-primary"
            placeholder="0"
          />
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={saveOrder}
              className="rounded-2xl border border-border bg-card px-4 py-3.5 font-semibold hover:bg-accent disabled:opacity-50"
            >
              Fazer Pedido
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={finishRound}
              className="rounded-2xl bg-primary px-4 py-3.5 font-semibold text-primary-foreground disabled:opacity-50"
            >
              Encerrar Rodada
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
