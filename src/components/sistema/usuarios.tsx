"use client";

import { useState, useTransition } from "react";
import {
  KeyRound, Pencil, ShieldCheck, Trash2, UserCog, UserPlus,
} from "lucide-react";
import { salvarUsuario } from "@/lib/actions-mvp2";
import {
  alternarStatusUsuario, criarUsuario, excluirUsuario, redefinirSenha,
} from "@/lib/actions-usuarios";
import Link from "next/link";
import { Badge, Button, CampoMascara, Input, Select, Vazio } from "@/components/ui";
import type { BadgeTom } from "@/components/ui";
import { Campo, Modal } from "@/components/ui/modal";
import { cn, iniciais, telefone, tempoRelativo } from "@/lib/utils";
import type { Usuario } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { useListaServidor } from "@/lib/usar-lista-servidor";

const MIN_SENHA = 8;

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
  const [usuarios, setUsuarios] = useListaServidor(iniciaisLista);
  const [editando, setEditando] = useState<Partial<Usuario> | null>(null);
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [, iniciar] = useTransition();
  const toast = useToast();

  const criando = editando !== null && !editando.id;
  const senhaCurta = senha.length > 0 && senha.length < MIN_SENHA;
  const senhaDiferente = repetir.length > 0 && senha !== repetir;
  const senhaPronta = senha.length >= MIN_SENHA && senha === repetir;

  function abrir(usuario: Partial<Usuario> | null) {
    setEditando(usuario);
    setSenha("");
    setRepetir("");
    setConfirmandoExclusao(false);
  }

  /** Cadastro novo: cria o acesso E o perfil, sem ninguém abrir o Supabase. */
  async function criar(dados: Partial<Usuario>) {
    if (!dados.nome?.trim() || !dados.email || !senhaPronta) return;
    setOcupado(true);

    const r = await criarUsuario({
      nome: dados.nome.trim(),
      email: dados.email.trim(),
      senha,
      role_slug: dados.role_slug ?? "atendimento",
      telefone: dados.telefone ?? null,
      cargo: dados.cargo ?? null,
    });

    setOcupado(false);
    if (!r.ok) {
      toast.erro("Não consegui criar o usuário", r.erro);
      return;
    }

    const perfil = PERFIS.find((p) => p.slug === dados.role_slug);
    setUsuarios((l) => [...l, {
      ...dados, role_nome: perfil?.nome ?? "Atendimento", status: "ativo",
      id: `novo-${Date.now()}`, ultimo_login: null,
      created_at: new Date().toISOString(),
    } as Usuario]);
    abrir(null);
    toast.ok("Usuário criado", `${dados.nome} já pode entrar com a senha definida`);
  }

  /** Edição: só o perfil muda aqui — senha tem botão próprio. */
  function salvar(dados: Partial<Usuario>) {
    if (!dados.nome?.trim()) return;
    const perfil = PERFIS.find((p) => p.slug === dados.role_slug);
    const pronto = { ...dados, role_nome: perfil?.nome ?? "Atendimento" };

    setUsuarios((l) => l.map((u) => (u.id === dados.id ? { ...u, ...pronto } as Usuario : u)));
    abrir(null);
    iniciar(async () => {
      const r = await salvarUsuario(pronto);
      if (r.ok) toast.ok("Usuário atualizado", dados.nome);
      else {
        setUsuarios(iniciaisLista);
        toast.erro("Não consegui salvar o usuário", r.erro);
      }
    });
  }

  async function trocarSenha(id: string) {
    if (!senhaPronta) return;
    setOcupado(true);
    const r = await redefinirSenha(id, senha);
    setOcupado(false);
    if (r.ok) {
      setSenha(""); setRepetir("");
      toast.ok("Senha redefinida", "Avise a pessoa qual é a senha nova");
    } else {
      toast.erro("Não consegui redefinir a senha", r.erro);
    }
  }

  async function desativarOuAtivar(u: Partial<Usuario>) {
    const ativar = u.status !== "ativo";
    setOcupado(true);
    const r = await alternarStatusUsuario(u.id!, ativar);
    setOcupado(false);
    if (!r.ok) { toast.erro("Não consegui alterar o acesso", r.erro); return; }

    setUsuarios((l) => l.map((x) => (x.id === u.id
      ? { ...x, status: ativar ? "ativo" : "inativo" } as Usuario : x)));
    abrir(null);
    toast.ok(ativar ? "Acesso liberado" : "Acesso bloqueado", u.nome);
  }

  async function excluir(u: Partial<Usuario>) {
    setOcupado(true);
    const r = await excluirUsuario(u.id!);
    setOcupado(false);
    if (!r.ok) { toast.erro("Não consegui excluir", r.erro); return; }

    setUsuarios((l) => l.filter((x) => x.id !== u.id));
    abrir(null);
    toast.ok("Usuário excluído", `${u.nome} não entra mais no sistema`);
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
          <Button variante="primario" tamanho="sm" onClick={() => abrir({
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

                  <Button tamanho="iconeSm" variante="fantasma" onClick={() => abrir(u)}
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
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ink-500" />
        <p className="text-[11px] leading-relaxed text-ink-400">
          {supabaseConectado
            ? "O acesso é dado aqui: você define o e-mail, a senha inicial e o perfil, e a pessoa já entra. Não existe recuperação por e-mail — quem esquecer a senha pede uma nova aqui, no botão Redefinir senha."
            : "Sem banco conectado o cadastro fica só nesta tela. Quando o Supabase entrar, o acesso passa a valer para o login de verdade."}
        </p>
      </div>

      {editando && (
        <Modal
          aberto
          onFechar={() => abrir(null)}
          titulo={editando.id ? `Editar ${editando.nome}` : "Adicionar usuário"}
          descricao="Permissões podem ser ajustadas individualmente depois"
          rodape={
            <>
              {editando.id && (
                <Button
                  variante="fantasma"
                  onClick={() => desativarOuAtivar(editando)}
                  disabled={ocupado}
                  className="mr-auto"
                >
                  {editando.status === "ativo" ? "Bloquear acesso" : "Liberar acesso"}
                </Button>
              )}
              <Button variante="fantasma" onClick={() => abrir(null)}>Cancelar</Button>
              <Button
                variante="primario"
                disabled={
                  ocupado || !editando.nome?.trim()
                  || (criando && (!editando.email || !senhaPronta))
                }
                onClick={() => (criando ? criar(editando) : salvar(editando))}
              >
                {criando ? "Criar usuário" : "Salvar"}
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

            {/* -------------------------- senha -------------------------- */}
            <div className="space-y-3 border-t border-[var(--linha)] pt-3">
              <p className="rotulo flex items-center gap-1.5 text-ink-400">
                <KeyRound className="size-3" />
                {criando ? "Senha inicial" : "Redefinir senha"}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Senha">
                  <Input
                    type="password" autoComplete="new-password" value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder={`mínimo ${MIN_SENHA} caracteres`}
                  />
                </Campo>
                <Campo rotulo="Repita">
                  <Input
                    type="password" autoComplete="new-password" value={repetir}
                    onChange={(e) => setRepetir(e.target.value)}
                    placeholder="••••••••"
                  />
                </Campo>
              </div>

              {senhaCurta && (
                <p className="text-[11px] text-warn-400">
                  Faltam {MIN_SENHA - senha.length} caracteres.
                </p>
              )}
              {senhaDiferente && (
                <p className="text-[11px] text-warn-400">As duas senhas estão diferentes.</p>
              )}

              {criando ? (
                <p className="text-[11px] leading-relaxed text-ink-500">
                  Combine a senha com a pessoa. Não há envio por e-mail, e ela
                  pode ser trocada aqui depois.
                </p>
              ) : (
                <Button
                  variante="suave" tamanho="sm"
                  disabled={!senhaPronta || ocupado}
                  onClick={() => trocarSenha(editando.id!)}
                >
                  <KeyRound className="size-3.5" /> Redefinir senha
                </Button>
              )}
            </div>

            {/* ------------------------- exclusão ------------------------- */}
            {editando.id && (
              <div className="border-t border-[var(--linha)] pt-3">
                {confirmandoExclusao ? (
                  <div className="rounded-lg bg-bad-500/8 px-3 py-2.5 ring-1 ring-inset ring-bad-500/20">
                    <p className="text-[11px] leading-relaxed text-bad-300">
                      Excluir <strong>{editando.nome}</strong> apaga o acesso e o
                      perfil de vez. O que a pessoa já fez continua registrado,
                      mas sem o nome dela.
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        variante="perigo" tamanho="sm" disabled={ocupado}
                        onClick={() => excluir(editando)}
                      >
                        <Trash2 className="size-3.5" /> Excluir mesmo
                      </Button>
                      <Button
                        variante="fantasma" tamanho="sm"
                        onClick={() => setConfirmandoExclusao(false)}
                      >
                        Deixa pra lá
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmandoExclusao(true)}
                    className="flex items-center gap-1.5 text-[11px] text-ink-500 transition-colors hover:text-bad-400"
                  >
                    <Trash2 className="size-3" /> Excluir este usuário
                  </button>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
