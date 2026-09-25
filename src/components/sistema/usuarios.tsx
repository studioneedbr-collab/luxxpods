"use client";

import { useState, useTransition } from "react";
import { Mail, Pencil, UserCog, UserPlus } from "lucide-react";
import { salvarUsuario } from "@/lib/actions-mvp2";
import Link from "next/link";
import { Badge, Button, CampoMascara, Input, Select, Vazio } from "@/components/ui";
import type { BadgeTom } from "@/components/ui";
import { Campo, Modal, Switch } from "@/components/ui/modal";
import { cn, iniciais, telefone, tempoRelativo } from "@/lib/utils";
import type { Usuario } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const PERFIS: Array<{ slug: string; nome: string; tom: BadgeTom; acesso: string }> = [
  { slug: "admin", nome: "Administrador", tom: "brand",
    acesso: "Tudo, incluindo preço, cancelamento, usuários e configurações" },
  { slug: "atendimento", nome: "Atendimento", tom: "info",
    acesso: "Conversas, clientes, funil e criação de pedidos" },
  { slug: "operacional", nome: "Operacional", tom: "ok",
    acesso: "Separação, estoque, catálogo e trocas" },
  { slug: "financeiro", nome: "Financeiro", tom: "gold",
    acesso: "Contas a pagar e receber, baixas e relatórios" },
  { slug: "entregador", nome: "Entregador", tom: "neutro",
    acesso: "Só a rota do dia: endereço, forma de pagamento e troco" },
];

export function TelaUsuarios({
  usuarios: iniciaisLista, supabaseConectado,
}: { usuarios: Usuario[]; supabaseConectado: boolean }) {
  const [usuarios, setUsuarios] = useState(iniciaisLista);
  const [editando, setEditando] = useState<Partial<Usuario> | null>(null);
  const [, iniciar] = useTransition();
  const toast = useToast();

  function salvar(dados: Partial<Usuario>) {
    if (!dados.nome?.trim()) return;
    const perfil = PERFIS.find((p) => p.slug === dados.role_slug);
    const pronto = { ...dados, role_nome: perfil?.nome ?? "Atendimento" };

    setUsuarios((l) => dados.id
      ? l.map((u) => (u.id === dados.id ? { ...u, ...pronto } as Usuario : u))
      : [...l, {
          ...pronto, id: `tmp-${Date.now()}`, status: "ativo",
          ultimo_login: null, created_at: new Date().toISOString(),
        } as Usuario]);
    setEditando(null);
    iniciar(async () => {
      const r = await salvarUsuario(pronto);
      if (r.ok) toast.ok(dados.id ? "Usuário atualizado" : "Usuário adicionado", dados.nome);
      else {
        setUsuarios(iniciaisLista);
        toast.erro("Não consegui salvar o usuário", r.erro);
      }
    });
  }

  const porPerfil = PERFIS.map((p) => ({
    ...p,
    total: usuarios.filter((u) => u.role_slug === p.slug).length,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ------------------------------- equipe ------------------------------ */}
      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="display text-[13px] font-semibold text-ink-100">Equipe</h2>
            <p className="text-[11px] text-ink-500">
              {usuarios.length} pessoa{usuarios.length === 1 ? "" : "s"} com acesso ao sistema
            </p>
          </div>
          <Button variante="primario" tamanho="sm" onClick={() => setEditando({
            nome: "", role_slug: "atendimento", status: "ativo",
          })}>
            <UserPlus className="size-3.5" /> Adicionar
          </Button>
        </div>

        {usuarios.length === 0 ? (
          <div className="chapa">
            <Vazio icone={UserCog} titulo="Nenhum usuário"
              descricao="Adicione a equipe e defina o nível de acesso de cada um." />
          </div>
        ) : (
          <ul className="chapa divide-y divide-[var(--linha)] overflow-hidden">
            {usuarios.map((u) => {
              const perfil = PERFIS.find((p) => p.slug === u.role_slug);
              return (
                <li key={u.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-850/60">
                  <span className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg text-[11px] font-semibold",
                    u.status === "ativo"
                      ? "bg-brand-500/14 text-brand-200"
                      : "bg-ink-800 text-ink-500",
                  )}>
                    {iniciais(u.nome)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-[13px] font-medium",
                      u.status === "ativo" ? "text-ink-100" : "text-ink-500",
                    )}>
                      {u.nome}
                      {u.cargo && <span className="ml-2 text-[11px] font-normal text-ink-500">{u.cargo}</span>}
                    </p>
                    <p className="truncate text-[11px] text-ink-500">
                      {u.email ?? "sem e-mail"}
                      {u.telefone ? ` · ${telefone(u.telefone)}` : ""}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[11px] text-ink-400">
                      {u.ultimo_login ? `ativo há ${tempoRelativo(u.ultimo_login)}` : "nunca entrou"}
                    </p>
                  </div>

                  <Badge tom={perfil?.tom ?? "neutro"}>{u.role_nome}</Badge>

                  {u.status !== "ativo" && <Badge tom="neutro">inativo</Badge>}

                  <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(u)}
                    aria-label={`Editar ${u.nome}`} title="Editar usuário">
                    <Pencil className="size-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------- perfis ------------------------------ */}
      <section className="space-y-2.5">
        <div>
          <h2 className="display text-[13px] font-semibold text-ink-100">Perfis de acesso</h2>
          <p className="text-[11px] text-ink-500">
            Cada perfil libera um conjunto de ações —{" "}
            <Link href="/permissoes" className="text-brand-300 hover:text-brand-200">
              ver a matriz completa
            </Link>
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {porPerfil.map((p) => (
            <div key={p.slug} className="chapa realce overflow-hidden px-4 py-3">
              {p.total > 0 && <span className="realce-barra" />}
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="display text-[13px] font-semibold text-ink-100">{p.nome}</h3>
                <span className={cn(
                  "numero text-[13px]",
                  p.total > 0 ? "text-brand-300" : "text-ink-600",
                )}>
                  {p.total}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{p.acesso}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------ como entra --------------------------- */}
      <div className="flex items-start gap-2.5 rounded-lg bg-ink-900 px-4 py-3 ring-1 ring-inset ring-[var(--linha)]">
        <Mail className="mt-0.5 size-3.5 shrink-0 text-ink-500" />
        <p className="text-[11px] leading-relaxed text-ink-400">
          {supabaseConectado
            ? "O login passa pelo Supabase Auth. Para dar acesso a alguém novo, envie o convite por e-mail no painel do Supabase — o perfil e as permissões ficam guardados aqui."
            : "Quando o Supabase estiver conectado, o login passa a ser feito por e-mail e senha, com convite para novos usuários."}
        </p>
      </div>

      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo={editando.id ? `Editar ${editando.nome}` : "Adicionar usuário"}
          descricao="Permissões podem ser ajustadas individualmente depois"
          rodape={
            <>
              <Button variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variante="primario" disabled={!editando.nome?.trim()}
                onClick={() => salvar(editando)}>
                Salvar
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Campo rotulo="Nome">
              <Input value={editando.nome ?? ""}
                onChange={(e) => setEditando((p) => ({ ...p!, nome: e.target.value }))} />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="E-mail">
                <Input type="email" value={editando.email ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p!, email: e.target.value }))} />
              </Campo>
              <Campo rotulo="Telefone">
                <CampoMascara tipo="telefone" valor={editando.telefone ?? ""}
                  aoMudar={(v) => setEditando((p) => ({ ...p!, telefone: v }))} />
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Cargo">
                <Input value={editando.cargo ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p!, cargo: e.target.value }))}
                  placeholder="Atendente" />
              </Campo>
              <Campo rotulo="Perfil de acesso">
                <Select value={editando.role_slug ?? "atendimento"} className="w-full"
                  onChange={(e) => setEditando((p) => ({ ...p!, role_slug: e.target.value }))}>
                  {PERFIS.map((p) => <option key={p.slug} value={p.slug}>{p.nome}</option>)}
                </Select>
              </Campo>
            </div>

            <Switch
              ligado={editando.status === "ativo"}
              onChange={(v) => setEditando((p) => ({ ...p!, status: v ? "ativo" : "inativo" }))}
              rotulo="Usuário ativo"
              descricao="Usuários inativos não conseguem entrar no sistema"
            />

            <p className="flex items-start gap-2 rounded-lg bg-brand-500/8 px-3 py-2.5 text-[11px] leading-relaxed text-brand-200 ring-1 ring-inset ring-brand-500/15">
              <Mail className="mt-0.5 size-3.5 shrink-0" />
              {supabaseConectado
                ? "O login é feito pelo Supabase Auth. Para um usuário novo entrar, envie o convite pelo painel do Supabase — o perfil e as permissões ficam guardados aqui."
                : "Quando o Supabase estiver conectado, o login passa a ser feito pelo Supabase Auth e o convite por e-mail fica disponível."}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
