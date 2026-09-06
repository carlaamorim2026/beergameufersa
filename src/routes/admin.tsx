import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, LockKeyhole, Play, RotateCcw } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ADMIN_PASSWORD,
  BRANDS,
  BRAND_ACCENT,
  DEMANDS,
  ROLES,
  ROUND_TYPES,
  TOTAL_WEEKS,
  computeWeekTransition,
  toCsv,
  type Brand,
  type GameConfig,
  type HistoryRow,
  type PlayerSession,
  type RoundType,
} from "@/lib/game";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel do Instrutor — Beer Game Logístico" },
      {
        name: "description",
        content:
          "Painel do mediador: configure a rodada, acompanhe as 16 equipes em tempo real, avance as semanas e exporte os resultados.",
      },
      { property: "og:title", content: "Painel do Instrutor — Beer Game Logístico" },
      {
        property: "og:description",
        content: "Controle das rodadas, monitoramento ao vivo e análise do efeito chicote.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem("beer-game-admin") === "1") setUnlocked(true);
  }, []);

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password === ADMIN_PASSWORD) {
              sessionStorage.setItem("beer-game-admin", "1");
              setUnlocked(true);
            } else {
              setError("Senha incorreta.");
            }
          }}
          className="w-full max-w-sm rounded-3xl border border-border bg-card p-8"
        >
          <LockKeyhole className="mb-4 h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold">Painel do Instrutor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe a senha do mediador para continuar.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Senha"
            className="mt-5 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:border-primary"
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground"
          >
            Desbloquear
          </button>
          <Link to="/" className="mt-4 block text-center text-sm text-muted-foreground">
            Voltar ao jogo
          </Link>
        </form>
      </div>
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [players, setPlayers] = useState<PlayerSession[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialStock, setInitialStock] = useState(20);
  const [roundType, setRoundType] = useState<RoundType>("Rodada Teste");
  const [tab, setTab] = useState<Brand>("Amstel");

  const refresh = useCallback(async () => {
    const [cfg, ps, hist] = await Promise.all([
      supabase.from("game_config").select("*").limit(1).maybeSingle(),
      supabase.from("player_sessions").select("*"),
      supabase.from("round_history").select("*").order("week", { ascending: true }),
    ]);
    if (cfg.data) {
      const c = cfg.data as unknown as GameConfig;
      setConfig(c);
      setInitialStock(c.default_initial_stock);
      setRoundType(c.round_type);
    }
    if (ps.data) setPlayers(ps.data as unknown as PlayerSession[]);
    if (hist.data) setHistory(hist.data as unknown as HistoryRow[]);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("beer-game-admin")
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

  const activePlayers = players.filter((p) => p.is_joined);
  const allReady =
    activePlayers.length > 0 && activePlayers.every((p) => p.is_ready);

  const resetGame = async () => {
    if (!config) return;
    setBusy(true);
    await supabase
      .from("game_config")
      .update({
        round_type: roundType,
        current_week: 1,
        default_initial_stock: initialStock,
        status: "in_progress",
      })
      .eq("id", config.id);
    await supabase.from("round_history").delete().eq("round_type", roundType);
    await supabase
      .from("player_sessions")
      .update({
        current_stock: initialStock,
        backlog: 0,
        incoming_order: DEMANDS[roundType][0] ?? 4,
        week_order: null,
        is_ready: false,
        is_joined: false,
      })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    setBusy(false);
    void refresh();
  };

  const advanceWeek = async () => {
    if (!config) return;
    setBusy(true);
    const { updates, history: rows } = computeWeekTransition(config, players);
    await supabase.from("round_history").insert(rows);
    for (const u of updates) {
      const { id, ...rest } = u;
      await supabase.from("player_sessions").update(rest).eq("id", id);
    }
    const nextWeek = config.current_week + 1;
    await supabase
      .from("game_config")
      .update({
        current_week: nextWeek,
        status: nextWeek > TOTAL_WEEKS ? "finished" : "in_progress",
      })
      .eq("id", config.id);
    setBusy(false);
    void refresh();
  };

  const chartData = useMemo(() => {
    const rows = history.filter((h) => h.round_type === config?.round_type && h.brand === tab);
    const weeks = new Map<number, Record<string, number>>();
    for (const r of rows) {
      const entry = weeks.get(r.week) ?? { week: r.week };
      entry[r.role] = r.order_placed;
      weeks.set(r.week, entry);
    }
    const demands = DEMANDS[(config?.round_type as RoundType) ?? "Rodada Teste"];
    return Array.from(weeks.values())
      .sort((a, b) => (a.week ?? 0) - (b.week ?? 0))
      .map((e) => ({ ...e, Cliente: demands[(e.week ?? 1) - 1] ?? 0 }));
  }, [history, config, tab]);

  const exportCsv = () => {
    const csv = toCsv(history);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "beer-game-resultados.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel do Instrutor</h1>
            <p className="text-sm text-muted-foreground">
              {config.round_type} · Semana {Math.min(config.current_week, TOTAL_WEEKS)} de{" "}
              {TOTAL_WEEKS} · {activePlayers.length} participantes ativos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/"
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
            >
              Ver jogo
            </Link>
          </div>
        </header>

        <section className="mb-6 grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Tipo de rodada</span>
              <select
                value={roundType}
                onChange={(e) => setRoundType(e.target.value as RoundType)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2"
              >
                {ROUND_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Estoque inicial geral</span>
              <input
                type="number"
                min={0}
                value={initialStock}
                onChange={(e) => setInitialStock(Number(e.target.value))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={resetGame}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 font-semibold hover:bg-accent disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Iniciar / Resetar Jogo
          </button>
          <button
            type="button"
            onClick={advanceWeek}
            disabled={busy || !allReady || config.current_week > TOTAL_WEEKS}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Avançar para Semana {config.current_week + 1}
          </button>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BRANDS.map((b) => (
            <div key={b} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`h-5 w-5 rounded-md bg-gradient-to-br ${BRAND_ACCENT[b]}`}
                  aria-hidden
                />
                <h2 className="font-semibold">{b}</h2>
              </div>
              <ul className="space-y-2">
                {ROLES.map((r) => {
                  const p = players.find((x) => x.brand === b && x.role === r);
                  if (!p) return null;
                  return (
                    <li key={r} className="rounded-xl border border-border/70 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            !p.is_joined
                              ? "bg-muted text-muted-foreground"
                              : p.is_ready
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                          }`}
                        >
                          {!p.is_joined ? "Vago" : p.is_ready ? "Pronto" : "Aguardando Pedido"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                        <span>Estoque: {p.current_stock}</span>
                        <span className={p.backlog > 0 ? "text-red-500" : ""}>
                          Dívida: {p.backlog}
                        </span>
                        <span>Pedido: {p.week_order ?? "—"}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Efeito Chicote — pedidos por semana</h2>
            <div className="flex flex-wrap items-center gap-2">
              {BRANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setTab(b)}
                  className={`rounded-xl px-3 py-1.5 text-sm ${
                    tab === b
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background hover:bg-accent"
                  }`}
                >
                  {b}
                </button>
              ))}
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Download className="h-4 w-4" /> Exportar CSV
              </button>
            </div>
          </div>
          <div className="h-[360px] w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Os dados aparecem aqui após a primeira semana concluída.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                  <XAxis dataKey="week" stroke="currentColor" fontSize={12} />
                  <YAxis stroke="currentColor" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      color: "var(--foreground)",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="Cliente" stroke="#64748b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Varejista" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Atacadista" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Distribuidor" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Fábrica" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
