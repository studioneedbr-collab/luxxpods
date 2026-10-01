"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Target, Trash2, TrendingUp, Zap } from "lucide-react";
import { excluirUpsell, salvarUpsell } from "@/lib/actions-mvp2";
import { Badge, Barra, Button, Input, Panel, Select, Vazio } from "@/components/ui";
import { Campo, Confirmar, Modal, Switch, Textarea } from "@/components/ui/modal";
import { brl, cn, num, pct } from "@/lib/utils";
import type { Produto, RegraUpsell } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { CampoMoeda } from "@/components/ui";
import { useListaServidor } from "@/lib/usar-lista-servidor";

const vazio: Partial<RegraUpsell> = {
  nome: "", mensagem: "", tipo_desconto: "valor", desconto: 10,
  prioridade: 1, status: "ativo",
};

export function TelaUpsell({
  regras: iniciais, produtos,
}: { regras: RegraUpsell[]; produtos: Produto[] }) {
  const [regras, setRegras] = useListaServidor(iniciais);
  const [editando, setEditando] = useState<Partial<RegraUpsell> | null>(null);
  const [excluindo, setExcluindo] = useState<RegraUpsell | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  function salvar(dados: Partial<RegraUpsell>) {
    if (!dados.nome?.trim() || !dados.mensagem?.trim()) return;
    const nomeOrigem = produtos.find((p) => p.id === dados.produto_origem)?.nome ?? null;
    const nomeDestino = produtos.find((p) => p.id === dados.produto_destino)?.nome ?? null;
    const pronto = { ...dados, produto_origem_nome: nomeOrigem, produto_destino_nome: nomeDestino };

    setRegras((l) => dados.id
      ? l.map((r) => (r.id === dados.id ? { ...r, ...pronto } as RegraUpsell : r))
      : [...l, {
          ...vazio, ...pronto, id: `tmp-${Date.now()}`,
          exibidas: 0, aceitas: 0, faturamento: 0,
          created_at: new Date().toISOString(),
        } as RegraUpsell]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarUpsell(dados);
      if (r.ok) toast.ok(dados.id ? "Regra atualizada" : "Regra criada", dados.nome);
      else toast.erro("Não consegui salvar a regra", r.erro);
    });
  }

  function remover(r: RegraUpsell) {
    setRegras((l) => l.filter((x) => x.id !== r.id));
    setExcluindo(null);
    iniciar(async () => {
      const resultado = await excluirUpsell(r.id);
      if (resultado.ok) toast.ok("Regra excluída", r.nome);
      else toast.erro("Não consegui excluir", resultado.erro);
    });
  }

  const totais = {
    exibidas: regras.reduce((a, r) => a + r.exibidas, 0),
    aceitas: regras.reduce((a, r) => a + r.aceitas, 0),
    faturamento: regras.reduce((a, r) => a + r.faturamento, 0),
  };
  const conversao = totais.exibidas ? (totais.aceitas / totais.exibidas) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo="Ofertas exibidas" valor={num(totais.exibidas)} />
        <Cartao rotulo="Ofertas aceitas" valor={num(totais.aceitas)} tom="ok" />
        <Cartao rotulo="Conversão" valor={pct(conversao)} tom="brand" />
        <Cartao rotulo="Faturamento gerado" valor={brl(totais.faturamento)} tom="gold" />
      </div>

      <Panel className="flex flex-wrap items-center justify-between gap-2 p-3">
        <p className="text-[11px] text-ink-400">
          O bot apresenta a oferta de maior prioridade antes de pedir o endereço.
        </p>
        <Button variante="primario" onClick={() => setEditando({ ...vazio, prioridade: regras.length + 1 })}>
          <Plus className="size-3.5" /> Nova regra
        </Button>
      </Panel>

      {regras.length === 0 ? (
        <Panel>
          <Vazio icone={TrendingUp} titulo="Nenhuma regra de upsell"
            descricao="Crie ofertas que o bot apresenta automaticamente antes do fechamento."
            acao={<Button variante="primario" tamanho="sm" onClick={() => setEditando({ ...vazio })}>
              <Plus className="size-3.5" /> Criar regra
            </Button>} />
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {[...regras].sort((a, b) => a.prioridade - b.prioridade).map((r) => {
            const conv = r.exibidas ? (r.aceitas / r.exibidas) * 100 : 0;
            return (
              <Panel key={r.id} className="overflow-hidden">
                <div className="flex items-start gap-3 border-b border-[var(--linha)] px-5 py-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-500/12 text-[11px] font-bold text-brand-300">
                    {r.prioridade}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink-100">{r.nome}</p>
                    <p className="truncate text-[11px] text-ink-500">
                      {r.produto_origem_nome ?? "qualquer produto"}
                      {" → "}
                      {r.produto_destino_nome ?? "—"}
                    </p>
                  </div>
                  <Badge tom={r.status === "ativo" ? "ok" : "neutro"} ponto>{r.status}</Badge>
                  <div className="flex gap-1">
                    <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(r)}
                          aria-label={`Editar ${r.nome}`} title="Editar regra">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button tamanho="iconeSm" variante="fantasma" onClick={() => setExcluindo(r)}
                          aria-label={`Excluir ${r.nome}`} title="Excluir regra">
                      <Trash2 className="size-3.5 text-bad-400" />
                    </Button>
                  </div>
                </div>

                <div className="px-5 py-3">
                  <div className="rounded-xl rounded-bl-sm bg-brand-500/18 px-3.5 py-2 text-[11px] leading-relaxed text-brand-50 ring-1 ring-inset ring-brand-500/20">
                    <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-brand-300">
                      <Zap className="size-2.5" /> mensagem do bot
                    </p>
                    {r.mensagem}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px]">
                    <span className="text-ink-500">Desconto oferecido</span>
                    <span className="font-semibold tabular-nums text-ink-100">
                      {r.tipo_desconto === "percentual" ? pct(r.desconto, 0) : brl(r.desconto)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-px border-t border-[var(--linha)] bg-ink-850">
                  {[
                    ["Exibidas", num(r.exibidas), "text-ink-100"],
                    ["Aceitas", num(r.aceitas), "text-ok-400"],
                    ["Gerou", brl(r.faturamento), "text-gold-400"],
                  ].map(([rot, val, cor]) => (
                    <div key={rot} className="bg-ink-900 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-ink-500">{rot}</p>
                      <p className={cn("mt-0.5 text-[13px] font-bold tabular-nums", cor)}>{val}</p>
                    </div>
                  ))}
                </div>

                <div className="px-5 py-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-500">Conversão da regra</span>
                    <span className={cn(
                      "font-bold tabular-nums",
                      conv >= 30 ? "text-ok-400" : conv >= 15 ? "text-warn-400" : "text-ink-400",
                    )}>
                      {pct(conv)}
                    </span>
                  </div>
                  <Barra valor={conv} tom={conv >= 30 ? "ok" : conv >= 15 ? "warn" : "brand"} className="mt-1.5" />
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {editando && (
        <FormUpsell regra={editando} produtos={produtos}
          onFechar={() => setEditando(null)} onSalvar={salvar} />
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={`Excluir "${excluindo?.nome}"?`}
        mensagem="O bot deixa de apresentar esta oferta. O histórico de conversão é mantido."
        textoConfirmar="Excluir"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && remover(excluindo)}
      />
    </div>
  );
}

function FormUpsell({
  regra, produtos, onFechar, onSalvar,
}: {
  regra: Partial<RegraUpsell>;
  produtos: Produto[];
  onFechar: () => void;
  onSalvar: (d: Partial<RegraUpsell>) => void;
}) {
  const [f, setF] = useState<Partial<RegraUpsell>>(regra);
  const set = <K extends keyof RegraUpsell>(k: K, v: RegraUpsell[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={regra.id ? "Editar regra" : "Nova regra de upsell"}
      descricao="Oferta apresentada pelo bot antes de pedir o endereço"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" onClick={() => onSalvar(f)}
            disabled={!f.nome?.trim() || !f.mensagem?.trim()}>
            Salvar regra
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo rotulo="Nome da regra" dica="Só para você identificar no painel">
          <Input value={f.nome ?? ""} onChange={(e) => set("nome", e.target.value)}
            placeholder="Leve 2 Ignite V300" />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Produto de origem" dica="Quando o cliente escolher este">
            <Select value={f.produto_origem ?? ""} className="w-full"
              onChange={(e) => set("produto_origem", e.target.value || null)}>
              <option value="">Qualquer produto</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Produto ofertado" dica="O bot oferece este">
            <Select value={f.produto_destino ?? ""} className="w-full"
              onChange={(e) => set("produto_destino", e.target.value || null)}>
              <option value="">Selecione…</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          </Campo>
        </div>

        <Campo rotulo="Mensagem do bot" dica="Curta, comercial e direta — como o cliente vai ler">
          <Textarea rows={3} value={f.mensagem ?? ""}
            onChange={(e) => set("mensagem", e.target.value)}
            placeholder="Quer aproveitar e levar mais uma unidade com R$ 15 de desconto? 🖤" />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Tipo">
            <Select value={f.tipo_desconto ?? "valor"} className="w-full"
              onChange={(e) => set("tipo_desconto", e.target.value as RegraUpsell["tipo_desconto"])}>
              <option value="valor">R$</option>
              <option value="percentual">%</option>
            </Select>
          </Campo>
          <Campo rotulo="Desconto">
            {f.tipo_desconto === "percentual" ? (
              <Input type="number" min={0} max={100} value={f.desconto ?? 0}
                onChange={(e) => set("desconto", Number(e.target.value))} />
            ) : (
              <CampoMoeda valor={f.desconto ?? 0} aoMudar={(v) => set("desconto", v)} />
            )}
          </Campo>
          <Campo rotulo="Prioridade" dica="1 = primeira">
            <Input type="number" value={f.prioridade ?? 1}
              onChange={(e) => set("prioridade", Number(e.target.value))} />
          </Campo>
        </div>

        <Switch
          ligado={f.status === "ativo"}
          onChange={(v) => set("status", v ? "ativo" : "inativo")}
          rotulo="Regra ativa"
          descricao="Regras inativas não são apresentadas pelo bot"
        />

        {f.mensagem && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-500">
              <Target className="size-3" /> Prévia no WhatsApp
            </p>
            <div className="rounded-xl rounded-bl-sm bg-brand-500/18 px-3.5 py-2 text-[13px] leading-relaxed text-brand-50 ring-1 ring-inset ring-brand-500/20">
              {f.mensagem}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Cartao({ rotulo, valor, tom = "neutro" }: {
  rotulo: string; valor: string; tom?: "neutro" | "ok" | "brand" | "gold";
}) {
  const cores = {
    neutro: "text-ink-100", ok: "text-ok-400", brand: "text-brand-300", gold: "text-gold-400",
  };
  return (
    <Panel className="p-4">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
      <p className={cn("mt-1 text-[19px] font-bold tabular-nums", cores[tom])}>{valor}</p>
    </Panel>
  );
}
