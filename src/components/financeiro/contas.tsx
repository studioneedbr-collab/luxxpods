"use client";

import { useState, useTransition } from "react";
import { Landmark, Pencil, Plus, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { salvarContaBancaria } from "@/lib/actions-mvp2";
import { Badge, Button, Input, Panel, Select, Vazio } from "@/components/ui";
import { Campo, Modal, Switch } from "@/components/ui/modal";
import { brl, cn } from "@/lib/utils";
import type { ContaBancaria, Lancamento } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const vazio: Partial<ContaBancaria> = {
  nome: "", banco: "", tipo: "corrente", saldo_inicial: 0, status: "ativo",
};

export function TelaContas({
  contas: iniciais, lancamentos,
}: { contas: ContaBancaria[]; lancamentos: Lancamento[] }) {
  const [contas, setContas] = useState(iniciais);
  const [editando, setEditando] = useState<Partial<ContaBancaria> | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  function salvar(dados: Partial<ContaBancaria>) {
    if (!dados.nome?.trim()) return;
    setContas((l) => dados.id
      ? l.map((c) => (c.id === dados.id ? { ...c, ...dados } as ContaBancaria : c))
      : [...l, {
          ...vazio, ...dados, id: `tmp-${Date.now()}`,
          saldo_atual: Number(dados.saldo_inicial ?? 0),
        } as ContaBancaria]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarContaBancaria(dados);
      if (r.ok) toast.ok(dados.id ? "Conta atualizada" : "Conta criada", dados.nome);
      else toast.erro("Não consegui salvar a conta", r.erro);
    });
  }

  const saldoTotal = contas
    .filter((c) => c.status === "ativo")
    .reduce((a, c) => a + c.saldo_atual, 0);

  return (
    <div className="space-y-3">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-500">Saldo consolidado</p>
          <p className={cn(
            "mt-0.5 text-2xl font-bold tabular-nums",
            saldoTotal >= 0 ? "text-ok-400" : "text-bad-400",
          )}>
            {brl(saldoTotal)}
          </p>
        </div>
        <Button variante="primario" onClick={() => setEditando({ ...vazio })}>
          <Plus className="size-3.5" /> Nova conta
        </Button>
      </Panel>

      {contas.length === 0 ? (
        <Panel>
          <Vazio icone={Landmark} titulo="Nenhuma conta cadastrada"
            descricao="Cadastre onde o dinheiro da operação entra e sai."
            acao={<Button variante="primario" tamanho="sm" onClick={() => setEditando({ ...vazio })}>
              <Plus className="size-3.5" /> Criar conta
            </Button>} />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contas.map((c) => {
            const entradas = lancamentos
              .filter((l) => l.tipo === "receber" && l.bank_account_id === c.id && l.status === "pago")
              .reduce((a, l) => a + l.valor, 0);
            const saidas = lancamentos
              .filter((l) => l.tipo === "pagar" && l.bank_account_id === c.id && l.status === "pago")
              .reduce((a, l) => a + l.valor, 0);

            return (
              <Panel key={c.id} className="overflow-hidden">
                <div className="flex items-start gap-3 border-b border-white/6 px-5 py-3.5">
                  <span className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl",
                    c.tipo === "caixa"
                      ? "bg-gold-500/12 text-gold-400"
                      : "bg-brand-500/12 text-brand-300",
                  )}>
                    {c.tipo === "caixa" ? <Wallet className="size-4" /> : <Landmark className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-100">{c.nome}</p>
                    <p className="truncate text-[11px] text-ink-500">
                      {c.banco ?? "—"}
                      {c.conta ? ` · ${c.agencia ?? ""} / ${c.conta}` : ""}
                    </p>
                  </div>
                  <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(c)}
                    aria-label={`Editar ${c.nome}`} title="Editar conta">
                    <Pencil className="size-3.5" />
                  </Button>
                </div>

                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-wide text-ink-500">Saldo atual</p>
                  <p className={cn(
                    "mt-0.5 text-xl font-bold tabular-nums",
                    c.saldo_atual >= 0 ? "text-ink-100" : "text-bad-400",
                  )}>
                    {brl(c.saldo_atual)}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-ink-500">
                    saldo inicial {brl(c.saldo_inicial)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-px border-t border-white/6 bg-white/4">
                  <div className="bg-ink-900/70 px-4 py-2.5">
                    <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-500">
                      <TrendingUp className="size-2.5" /> Entradas
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-ok-400">{brl(entradas)}</p>
                  </div>
                  <div className="bg-ink-900/70 px-4 py-2.5">
                    <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-500">
                      <TrendingDown className="size-2.5" /> Saídas
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-bad-400">{brl(saidas)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/6 px-5 py-2.5">
                  <Badge tom={c.status === "ativo" ? "ok" : "neutro"} ponto>{c.status}</Badge>
                  <span className="text-[11px] capitalize text-ink-500">{c.tipo}</span>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {editando && (
        <FormConta conta={editando} onFechar={() => setEditando(null)} onSalvar={salvar} />
      )}
    </div>
  );
}

function FormConta({
  conta, onFechar, onSalvar,
}: {
  conta: Partial<ContaBancaria>;
  onFechar: () => void;
  onSalvar: (d: Partial<ContaBancaria>) => void;
}) {
  const [f, setF] = useState<Partial<ContaBancaria>>(conta);
  const set = <K extends keyof ContaBancaria>(k: K, v: ContaBancaria[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={conta.id ? `Editar ${conta.nome}` : "Nova conta"}
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" disabled={!f.nome?.trim()} onClick={() => onSalvar(f)}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome da conta">
            <Input value={f.nome ?? ""} onChange={(e) => set("nome", e.target.value)}
              placeholder="Conta Principal" />
          </Campo>
          <Campo rotulo="Tipo">
            <Select value={f.tipo ?? "corrente"} className="w-full"
              onChange={(e) => set("tipo", e.target.value)}>
              <option value="corrente">Conta corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="caixa">Caixa (dinheiro)</option>
              <option value="digital">Conta digital</option>
            </Select>
          </Campo>
        </div>

        <Campo rotulo="Banco">
          <Input value={f.banco ?? ""} onChange={(e) => set("banco", e.target.value)}
            placeholder="Nubank" />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Agência">
            <Input value={f.agencia ?? ""} onChange={(e) => set("agencia", e.target.value)} />
          </Campo>
          <Campo rotulo="Conta">
            <Input value={f.conta ?? ""} onChange={(e) => set("conta", e.target.value)} />
          </Campo>
          <Campo rotulo="Saldo inicial (R$)">
            <Input type="number" step="0.01" value={f.saldo_inicial ?? 0}
              onChange={(e) => set("saldo_inicial", Number(e.target.value))} />
          </Campo>
        </div>

        <Switch
          ligado={f.status === "ativo"}
          onChange={(v) => set("status", v ? "ativo" : "inativo")}
          rotulo="Conta ativa"
          descricao="Contas inativas não aparecem nos lançamentos"
        />
      </div>
    </Modal>
  );
}
