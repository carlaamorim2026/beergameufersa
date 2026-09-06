export const BRANDS = ["Amstel", "Budweiser", "Heineken", "Skol"] as const;
export const ROLES = ["Fábrica", "Distribuidor", "Atacadista", "Varejista"] as const;
export const ROUND_TYPES = ["Rodada Teste", "Rodada Antes", "Rodada Depois"] as const;

export type Brand = (typeof BRANDS)[number];
export type Role = (typeof ROLES)[number];
export type RoundType = (typeof ROUND_TYPES)[number];

export const TOTAL_WEEKS = 30;
export const ADMIN_PASSWORD = "producao@Beer";

export const DEMANDS: Record<RoundType, number[]> = {
  "Rodada Teste": [
    12, 12, 12, 12, 5, 5, 8, 8, 5, 5, 4, 4, 4, 5, 8, 8, 8, 5, 4, 4, 4, 8, 9, 8, 4, 4, 4, 4, 4, 4,
  ],
  "Rodada Antes": [
    12, 12, 12, 12, 5, 5, 8, 8, 5, 5, 4, 4, 4, 5, 8, 8, 8, 5, 4, 4, 4, 8, 9, 8, 4, 4, 4, 4, 4, 4,
  ],
  "Rodada Depois": [
    8, 8, 12, 12, 8, 8, 5, 5, 5, 12, 12, 8, 8, 5, 5, 3, 5, 8, 5, 5, 6, 6, 8, 8, 5, 5, 5, 5, 4, 4,
  ],
};

export type GameConfig = {
  id: string;
  round_type: RoundType;
  current_week: number;
  default_initial_stock: number;
  status: string;
};

export type PlayerSession = {
  id: string;
  brand: Brand;
  role: Role;
  current_stock: number;
  backlog: number;
  incoming_order: number;
  week_order: number | null;
  is_joined: boolean;
  is_ready: boolean;
};

export type HistoryRow = {
  round_type: string;
  brand: string;
  role: string;
  week: number;
  demand_received: number;
  order_placed: number;
  final_stock: number;
  final_backlog: number;
};

/** Quem abastece quem: o elo à direita entrega ao elo à esquerda. */
export const DOWNSTREAM: Record<Role, Role | "Cliente"> = {
  Varejista: "Cliente",
  Atacadista: "Varejista",
  Distribuidor: "Atacadista",
  Fábrica: "Distribuidor",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  Fábrica: "Produz os paletes e abastece o Distribuidor.",
  Distribuidor: "Abastece o Atacadista com o que recebe da Fábrica.",
  Atacadista: "Abastece o Varejista com o que recebe do Distribuidor.",
  Varejista: "Atende diretamente a demanda do cliente final.",
};

export const BRAND_ACCENT: Record<Brand, string> = {
  Amstel: "from-red-500 to-rose-700",
  Budweiser: "from-red-600 to-red-900",
  Heineken: "from-emerald-500 to-green-700",
  Skol: "from-amber-400 to-yellow-600",
};

export function demandForWeek(roundType: RoundType, week: number): number {
  const list = DEMANDS[roundType] ?? DEMANDS["Rodada Teste"];
  return list[Math.min(Math.max(week, 1), TOTAL_WEEKS) - 1] ?? 4;
}

export type AdvanceResult = {
  updates: Array<{
    id: string;
    current_stock: number;
    backlog: number;
    incoming_order: number;
    week_order: null;
    is_ready: false;
  }>;
  history: HistoryRow[];
};

/**
 * Executa a virada de semana para todas as marcas.
 * Cada elo atende o pedido recebido (mais a dívida acumulada) com o estoque
 * disponível; o que sobrar vira backlog. Em seguida recebe o que o elo acima
 * conseguiu enviar (a Fábrica recebe a própria produção).
 */
export function computeWeekTransition(
  config: GameConfig,
  players: PlayerSession[],
): AdvanceResult {
  const week = config.current_week;
  const updates: AdvanceResult["updates"] = [];
  const history: HistoryRow[] = [];

  for (const brand of BRANDS) {
    const byRole = new Map<Role, PlayerSession>();
    for (const p of players) if (p.brand === brand) byRole.set(p.role, p);
    if (byRole.size === 0) continue;

    const orderOf = (role: Role) => {
      const p = byRole.get(role);
      if (!p) return 0;
      return p.week_order ?? p.incoming_order;
    };

    const shipped = new Map<Role, number>();
    const afterShip = new Map<Role, { stock: number; backlog: number }>();

    for (const role of ROLES) {
      const p = byRole.get(role);
      if (!p) continue;
      const demand = p.incoming_order + p.backlog;
      const ship = Math.max(0, Math.min(p.current_stock, demand));
      shipped.set(role, ship);
      afterShip.set(role, { stock: p.current_stock - ship, backlog: demand - ship });
    }

    for (const role of ROLES) {
      const p = byRole.get(role);
      const state = afterShip.get(role);
      if (!p || !state) continue;

      const supply =
        role === "Fábrica" ? orderOf("Fábrica") : (shipped.get(upstreamOf(role)!) ?? 0);

      const nextStock = state.stock + supply;
      const placed = orderOf(role);

      const nextIncoming =
        role === "Varejista"
          ? demandForWeek(config.round_type, week + 1)
          : orderOf(downstreamRole(role)!);

      history.push({
        round_type: config.round_type,
        brand,
        role,
        week,
        demand_received: p.incoming_order,
        order_placed: placed,
        final_stock: nextStock,
        final_backlog: state.backlog,
      });

      updates.push({
        id: p.id,
        current_stock: nextStock,
        backlog: state.backlog,
        incoming_order: nextIncoming,
        week_order: null,
        is_ready: false,
      });
    }
  }

  return { updates, history };
}

function upstreamOf(role: Role): Role | null {
  switch (role) {
    case "Varejista":
      return "Atacadista";
    case "Atacadista":
      return "Distribuidor";
    case "Distribuidor":
      return "Fábrica";
    default:
      return null;
  }
}

function downstreamRole(role: Role): Role | null {
  const d = DOWNSTREAM[role];
  return d === "Cliente" ? null : d;
}

export function toCsv(rows: HistoryRow[]): string {
  const header = "Rodada,Cerveja,Elo,Semana,Pedido,Estoque,Divida";
  const body = rows.map((r) =>
    [r.round_type, r.brand, r.role, r.week, r.order_placed, r.final_stock, r.final_backlog].join(
      ",",
    ),
  );
  return [header, ...body].join("\n");
}
