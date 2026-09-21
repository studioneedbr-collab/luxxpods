"use client";

import { useState, useTransition } from "react";
import { Pencil, Shield, UserCog, UserPlus, Mail } from "lucide-react";
import { salvarUsuario } from "@/lib/actions-mvp2";
import {
  Badge, Button, Input, Panel, PanelHeader, Select, Table, Td, Th, Tr, Vazio,
} from "@/components/ui";
import type { BadgeTom } from "@/components/ui";
import { Campo, Modal, Switch } from "@/components/ui/modal";
import { iniciais, telefone, tempoRelativo } from "@/lib/utils";
import type { Usuario } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const PERFIS: Array<{ slug: string; nome: string; tom: BadgeTom; acesso: string }> = [
  { slug: "admin", nome: "Administrador", tom: "brand", acesso: "Acesso total ao sistema" },
  { slug: "atendimento", nome: "Atendimento", tom: "info", acesso: "Chats, clientes, pedidos e kanban" },
  { slug: "operacional", nome: "Operacional", tom: "ok", acesso: "Pedidos, separação, estoque e trocas" },
  { slug: "financeiro", nome: "Financeiro", tom: "gold", acesso: "Contas e relatórios financeiros" },
  { slug: "entregador", nome: "Entregador", tom: "neutro", acesso: "Pedidos para entrega, endereço, pagamento e troco" },
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

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHeader titulo="Perfis de acesso" icone={Shield}
          descricao="Cada perfil concede um conjunto de permissões" />
        <Table>
          <thead>
            <tr>
              <Th>Perfil</Th><Th>O que acessa</Th>
              <Th className="text-center">Usuários</Th>
            </tr>
          </thead>
          <tbody>
            {PERFIS.map((p) => (
              <Tr key={p.slug}>
                <Td><Badge tom={p.tom}>{p.nome}</Badge></Td>
                <Td className="text-ink-300">{p.acesso}</Td>
                <Td className="text-center tabular-nums text-ink-400">
                  {usuarios.filter((u) => u.role_slug === p.slug).length}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader titulo="Usuários" icone={UserCog}
          descricao={supabaseConectado
            ? "Novos acessos são criados pelo convite do Supabase Auth"
            : "Equipe com acesso ao sistema"}
          acao={
            <Button variante="primario" tamanho="sm" onClick={() => setEditando({
              nome: "", role_slug: "atendimento", status: "ativo",
            })}>
              <UserPlus className="size-3.5" /> Adicionar
            </Button>
          } />
        {usuarios.length === 0 ? (
          <Vazio icone={UserCog} titulo="Nenhum usuário"
            descricao="Adicione a equipe e defina o nível de acesso de cada um." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Usuário</Th><Th>Contato</Th><Th>Cargo</Th>
                <Th className="text-center">Perfil</Th>
                <Th>Último acesso</Th>
                <Th className="text-center">Status</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const perfil = PERFIS.find((p) => p.slug === u.role_slug);
                return (
                  <Tr key={u.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-bold text-white">
                          {iniciais(u.nome)}
                        </span>
                        <span className="truncate font-medium text-ink-100">{u.nome}</span>
                      </div>
                    </Td>
                    <Td>
                      <p className="truncate text-[11px] text-ink-300">{u.email ?? "—"}</p>
                      <p className="truncate text-[11px] tabular-nums text-ink-500">
                        {u.telefone ? telefone(u.telefone) : ""}
                      </p>
                    </Td>
                    <Td className="text-ink-300">{u.cargo ?? "—"}</Td>
                    <Td className="text-center">
                      <Badge tom={perfil?.tom ?? "neutro"}>{u.role_nome}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-[11px] text-ink-400">
                      {u.ultimo_login ? tempoRelativo(u.ultimo_login) : "nunca"}
                    </Td>
                    <Td className="text-center">
                      <Badge tom={u.status === "ativo" ? "ok" : "neutro"} ponto>{u.status}</Badge>
                    </Td>
                    <Td className="text-right">
                      <Button tamanho="iconeSm" variante="fantasma" onClick={() => setEditando(u)}
                        aria-label={`Editar ${u.nome}`} title="Editar usuário">
                        <Pencil className="size-3.5" />
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

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
                <Input value={editando.telefone ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p!, telefone: e.target.value }))} />
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
