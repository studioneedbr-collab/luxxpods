"use client";

import { useMemo, useState, useTransition } from "react";
import { Percent, Plus, Search, Ticket, Trash2, Pencil, DollarSign } from "lucide-react";
import { excluirCupom, salvarCupom } from "@/lib/actions-mvp2";
import {
  Badge, Button, Input, Panel, PanelHeader, Select, Table, Td, Th, Tr, Vazio,
} from "@/components/ui";
import { Campo, Confirmar, Modal, Switch, Textarea } from "@/components/ui/modal";
import { Paginacao, usePaginacao } from "@/components/ui/paginacao";
import { brl, cn, num, pct } from "@/lib/utils";
import type { Cupom } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const vazio: Partial<Cupom> = {
  codigo: "", descricao: "", tipo_desconto: "percentual", valor: 10,
  valor_minimo: 0, limite_total: null, limite_cliente: null, status: "ativo",
};

export function TelaCupons({ cupons: iniciais }: { cupons: Cupom[] }) {
  const [cupons, setCupons] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Partial<Cupom> | null>(null);
  const [excluindo, setExcluindo] = useState<Cupom | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return cupons;
    return cupons.filter((c) =>
      c.codigo.toLowerCase().includes(t) || (c.descricao ?? "").toLowerCase().includes(t));
  }, [cupons, busca]);

  function salvar(dados: Partial<Cupom>) {
    const codigo = (dados.codigo ?? "").trim().toUpperCase();
    if (!codigo) return;
    const pronto = { ...dados, codigo };

    setCupons((l) => dados.id
      ? l.map((c) => (c.id === dados.id ? { ...c, ...pronto } as Cupom : c))
      : [{
          ...vazio, ...pronto, id: `tmp-${Date.now()}`, usos: 0,
          created_at: new Date().toISOString(),
        } as Cupom, ...l]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarCupom(pronto);
      if (r.ok) toast.ok(dados.id ? "Cupom atualizado" : "Cupom criado", codigo);
      else toast.erro("Não consegui salvar o cupom", r.erro);
    });
  }

  function remover(c: Cupom) {
    setCupons((l) => l.filter((x) => x.id !== c.id));
    setExcluindo(null);
    iniciar(async () => {
      const r = await excluirCupom(c.id);
      if (r.ok) toast.ok("Cupom excluído", c.codigo);
      else toast.erro("Não consegui excluir", r.erro);
    });
  }

  const { visiveis, props: paginacao } = usePaginacao(filtrados, 25);
  const ativos = cupons.filter((c) => c.status === "ativo");
  const usos = cupons.reduce((a, c) => a + c.usos, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cartao rotulo="Cupons ativos" valor={num(ativos.length)} tom="ok" />
        <Cartao rotulo="Cupons cadastrados" valor={num(cupons.length)} />
        <Cartao rotulo="Utilizações totais" valor={num(usos)} tom="brand" />
        <Cartao rotulo="Com limite atingido"
          valor={num(cupons.filter((c) => c.limite_total && c.usos >= c.limite_total).length)}
          tom="warn" />
      </div>

      <Panel className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código ou descrição…"
            className="h-9 w-full rounded-lg bg-white/4 pl-8 pr-3 text-sm text-ink-100 ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50"
          />
        </div>
        <Button variante="primario" onClick={() => setEditando({ ...vazio })}>
          <Plus className="size-3.5" /> Novo cupom
        </Button>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader titulo="Cupons" icone={Ticket}
          descricao="Validados no fechamento do pedido, pelo bot e pelo atendente" />
        {filtrados.length === 0 ? (
          <Vazio icone={Ticket} titulo="Nenhum cupom"
            descricao="Crie um código de desconto para usar nas campanhas."
            acao={<Button variante="primario" tamanho="sm" onClick={() => setEditando({ ...vazio })}>
              <Plus className="size-3.5" /> Criar cupom
            </Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Código</Th><Th>Descrição</Th>
                <Th className="text-right">Desconto</Th>
                <Th className="text-right">Valor mínimo</Th>
                <Th className="text-center">Usos</Th>
                <Th>Validade</Th>
                <Th className="text-center">Status</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => {
                const esgotado = c.limite_total != null && c.usos >= c.limite_total;
                return (
                  <Tr key={c.id}>
                    <Td>
                      <code className="rounded-md bg-brand-500/12 px-2 py-0.5 text-xs font-bold tracking-wide text-brand-200">
                        {c.codigo}
                      </code>
                    </Td>
                    <Td className="max-w-[240px] truncate text-ink-300">{c.descricao ?? "—"}</Td>
                    <Td className="text-right font-semibold tabular-nums text-ink-100">
                      {c.tipo_desconto === "percentual" ? pct(c.valor, 0) : brl(c.valor)}
                    </Td>
                    <Td className="text-right tabular-nums text-ink-400">
                      {c.valor_minimo > 0 ? brl(c.valor_minimo) : "—"}
                    </Td>
                    <Td className="text-center">
                      <span className={cn("tabular-nums", esgotado ? "text-bad-400" : "text-ink-200")}>
                        {c.usos}
                        {c.limite_total != null && <span className="text-ink-600">/{c.limite_total}</span>}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-[11px] tabular-nums text-ink-400">
                      {c.inicio || c.fim
                        ? `${c.inicio ? new Date(c.inicio).toLocaleDateString("pt-BR") : "—"} a ${c.fim ? new Date(c.fim).toLocaleDateString("pt-BR") : "—"}`
                        : "sem prazo"}
                    </Td>
                    <Td className="text-center">
                      <Badge tom={esgotado ? "bad" : c.status === "ativo" ? "ok" : "neutro"} ponto>
                        {esgotado ? "esgotado" : c.status}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(c)}
                          aria-label={`Editar ${c.codigo}`} title="Editar cupom">
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button tamanho="iconeSm" variante="fantasma" onClick={() => setExcluindo(c)}
                          aria-label={`Excluir ${c.codigo}`} title="Excluir cupom">
                          <Trash2 className="size-3.5 text-bad-400" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Paginacao {...paginacao} rotulo="cupons" />
      </Panel>

      {editando && (
        <FormCupom cupom={editando} onFechar={() => setEditando(null)} onSalvar={salvar} />
      )}

      <Confirmar
        aberto={Boolean(excluindo)}
        titulo={`Excluir ${excluindo?.codigo}?`}
        mensagem="O cupom deixa de ser aceito imediatamente. Os pedidos que já usaram continuam inalterados."
        textoConfirmar="Excluir"
        perigo
        onCancelar={() => setExcluindo(null)}
        onConfirmar={() => excluindo && remover(excluindo)}
      />
    </div>
  );
}

function FormCupom({
  cupom, onFechar, onSalvar,
}: {
  cupom: Partial<Cupom>;
  onFechar: () => void;
  onSalvar: (d: Partial<Cupom>) => void;
}) {
  const [f, setF] = useState<Partial<Cupom>>(cupom);
  const set = <K extends keyof Cupom>(k: K, v: Cupom[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={cupom.id ? `Editar ${cupom.codigo}` : "Novo cupom"}
      descricao="Regras de desconto validadas na hora de fechar o pedido"
      rodape={
        <>
          <Button variante="fantasma" onClick={onFechar}>Cancelar</Button>
          <Button variante="primario" onClick={() => onSalvar(f)} disabled={!f.codigo?.trim()}>
            Salvar cupom
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Código" dica="O cliente digita exatamente assim">
            <Input
              value={f.codigo ?? ""}
              onChange={(e) => set("codigo", e.target.value.toUpperCase())}
              placeholder="LUXX10"
              className="font-mono tracking-wide"
            />
          </Campo>
          <Campo rotulo="Tipo de desconto">
            <Select
              value={f.tipo_desconto ?? "percentual"}
              onChange={(e) => set("tipo_desconto", e.target.value as Cupom["tipo_desconto"])}
              className="w-full"
            >
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor fixo (R$)</option>
            </Select>
          </Campo>
        </div>

        <Campo rotulo="Descrição">
          <Textarea
            rows={2}
            value={f.descricao ?? ""}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="10% na primeira compra"
          />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={f.tipo_desconto === "percentual" ? "Desconto (%)" : "Desconto (R$)"}>
            <Input type="number" step="0.01" value={f.valor ?? 0}
              onChange={(e) => set("valor", Number(e.target.value))} />
          </Campo>
          <Campo rotulo="Valor mínimo do pedido (R$)" dica="0 = sem mínimo">
            <Input type="number" step="0.01" value={f.valor_minimo ?? 0}
              onChange={(e) => set("valor_minimo", Number(e.target.value))} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Limite total de usos" dica="vazio = ilimitado">
            <Input type="number" value={f.limite_total ?? ""}
              onChange={(e) => set("limite_total", e.target.value ? Number(e.target.value) : null)} />
          </Campo>
          <Campo rotulo="Limite por cliente" dica="vazio = ilimitado">
            <Input type="number" value={f.limite_cliente ?? ""}
              onChange={(e) => set("limite_cliente", e.target.value ? Number(e.target.value) : null)} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Início da validade">
            <Input type="date" value={(f.inicio ?? "").slice(0, 10)}
              onChange={(e) => set("inicio", e.target.value || null)} />
          </Campo>
          <Campo rotulo="Fim da validade">
            <Input type="date" value={(f.fim ?? "").slice(0, 10)}
              onChange={(e) => set("fim", e.target.value || null)} />
          </Campo>
        </div>

        <Switch
          ligado={f.status === "ativo"}
          onChange={(v) => set("status", v ? "ativo" : "inativo")}
          rotulo="Cupom ativo"
          descricao="Cupons inativos são recusados no fechamento"
        />

        <div className="flex items-center gap-2 rounded-lg bg-brand-500/8 px-3 py-2.5 ring-1 ring-inset ring-brand-500/15">
          {f.tipo_desconto === "percentual"
            ? <Percent className="size-3.5 shrink-0 text-brand-300" />
            : <DollarSign className="size-3.5 shrink-0 text-brand-300" />}
          <p className="text-[11px] leading-relaxed text-brand-200">
            Em um pedido de R$ 100, este cupom desconta{" "}
            <strong>{brl(Number(f.valor) || 0)}</strong>
            {Number(f.valor_minimo) > 0 && ` — válido só acima de ${brl(Number(f.valor_minimo))}`}.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Cartao({ rotulo, valor, tom = "neutro" }: {
  rotulo: string; valor: string; tom?: "neutro" | "ok" | "brand" | "warn";
}) {
  const cores = {
    neutro: "text-ink-100", ok: "text-ok-400", brand: "text-brand-300", warn: "text-warn-400",
  };
  return (
    <Panel className="p-4">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{rotulo}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", cores[tom])}>{valor}</p>
    </Panel>
  );
}
