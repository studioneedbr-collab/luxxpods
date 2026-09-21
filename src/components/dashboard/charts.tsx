"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { brl, num } from "@/lib/utils";
import { CalendarOff } from "lucide-react";
import type { SeriePonto } from "@/lib/types";

const CORES = ["#9563ff", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#f5c451", "#22d3ee", "#c084fc"];

function TooltipBox({ active, payload, label, moeda }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  moeda?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-ink-850/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label && <p className="mb-1 font-medium text-ink-200">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 tabular-nums text-ink-300">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-ink-100">
            {moeda || p.dataKey === "faturamento" ? brl(p.value) : num(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Placeholder quando o período escolhido não tem movimento. */
function SemDados({ altura, mensagem }: { altura: number; mensagem: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-center"
      style={{ height: altura }}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-white/4 text-ink-600">
        <CalendarOff className="size-4" />
      </span>
      <p className="text-xs text-ink-500">{mensagem}</p>
      <p className="text-[11px] text-ink-600">Troque o período no filtro acima</p>
    </div>
  );
}

const diaCurto = (d: unknown) => {
  const partes = String(d ?? "").split("-");
  return partes.length === 3 ? partes[2] + "/" + partes[1] : String(d ?? "");
};

export function GraficoFaturamento({ dados }: { dados: SeriePonto[] }) {
  if (dados.every((d) => d.faturamento === 0)) {
    return <SemDados altura={260} mensagem="Nenhuma venda neste período" />;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={dados} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9563ff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#9563ff" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="dia" tickFormatter={diaCurto} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
               tickLine={false} axisLine={false} width={46} />
        <Tooltip content={<TooltipBox moeda />} labelFormatter={diaCurto} />
        <Area type="monotone" dataKey="faturamento" name="Faturamento"
              stroke="#9563ff" strokeWidth={2} fill="url(#gFat)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GraficoPedidosLeads({ dados }: { dados: SeriePonto[] }) {
  if (dados.every((d) => d.pedidos === 0 && d.leads === 0)) {
    return <SemDados altura={230} mensagem="Nenhum lead ou pedido neste período" />;
  }

  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={dados} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="dia" tickFormatter={diaCurto} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={34} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} labelFormatter={diaCurto} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#9a9ab5" }} iconType="circle" iconSize={7} />
        <Line type="monotone" dataKey="leads" name="Leads" stroke="#38bdf8" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="pedidos" name="Pedidos" stroke="#34d399" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function GraficoBarras({
  dados, chaveX, chaveY, cor = "#9563ff", moeda, altura = 240,
}: {
  dados: Array<Record<string, string | number>>;
  chaveX: string; chaveY: string; cor?: string; moeda?: boolean; altura?: number;
}) {
  if (dados.length === 0 || dados.every((d) => !Number(d[chaveY]))) {
    return <SemDados altura={altura} mensagem="Sem dados para exibir" />;
  }

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false}
               tickFormatter={(v) => (moeda ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)) : String(v))} />
        <YAxis type="category" dataKey={chaveX} tickLine={false} axisLine={false} width={132} />
        <Tooltip content={<TooltipBox moeda={moeda} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey={chaveY} name={moeda ? "Valor" : "Quantidade"} radius={[0, 5, 5, 0]} fill={cor} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficoRosca({
  dados, altura = 220,
}: { dados: Array<{ nome: string; valor: number }>; altura?: number }) {
  const total = dados.reduce((a, d) => a + d.valor, 0);

  if (total === 0) {
    return <SemDados altura={altura} mensagem="Sem dados no período" />;
  }

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <PieChart>
        <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="58%" outerRadius="86%"
             paddingAngle={2} stroke="none">
          {dados.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
        </Pie>
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0];
          const v = Number(p.value);
          return (
            <div className="rounded-lg border border-white/10 bg-ink-850/95 px-3 py-2 text-xs shadow-xl">
              <p className="font-medium text-ink-100">{p.name}</p>
              <p className="tabular-nums text-ink-300">
                {num(v)} · {total ? ((v / total) * 100).toFixed(1).replace(".", ",") : 0}%
              </p>
            </div>
          );
        }} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#9a9ab5" }} iconType="circle" iconSize={7} />
      </PieChart>
    </ResponsiveContainer>
  );
}
