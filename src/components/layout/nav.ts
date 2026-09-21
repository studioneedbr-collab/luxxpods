import {
  LayoutDashboard, MessagesSquare, KanbanSquare, Users, CalendarDays, ListChecks,
  ShoppingBag, Boxes, Package, Droplets, FileInput, RefreshCcw, Bike,
  Ticket, TrendingUp, Megaphone, Wallet, Landmark, ArrowDownCircle, ArrowUpCircle,
  Tags, BarChart3, LineChart, PieChart, Bot, Settings, Shield, Plug, Printer,
  ScrollText, UserCog, Gauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ItemNav {
  href: string;
  rotulo: string;
  icone: LucideIcon;
  badge?: "conversas" | "pedidos" | "tarefas";
}

export interface GrupoNav {
  titulo: string;
  itens: ItemNav[];
}

export const NAV: GrupoNav[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", rotulo: "Dashboard", icone: LayoutDashboard },
    ],
  },
  {
    titulo: "Atendimento",
    itens: [
      { href: "/painel-atendimento", rotulo: "Painel", icone: Gauge },
      { href: "/chats", rotulo: "Conversas", icone: MessagesSquare, badge: "conversas" },
      { href: "/kanban", rotulo: "Kanban", icone: KanbanSquare },
      { href: "/clientes", rotulo: "Clientes", icone: Users },
      { href: "/calendario", rotulo: "Calendário", icone: CalendarDays },
      { href: "/tarefas", rotulo: "Tarefas", icone: ListChecks, badge: "tarefas" },
    ],
  },
  {
    titulo: "Operacional",
    itens: [
      { href: "/pedidos", rotulo: "Pedidos", icone: ShoppingBag, badge: "pedidos" },
      { href: "/catalogo", rotulo: "Catálogo", icone: Boxes },
      { href: "/produtos", rotulo: "Produtos", icone: Package },
      { href: "/sabores", rotulo: "Sabores", icone: Droplets },
      { href: "/estoque", rotulo: "Estoque", icone: Boxes },
      { href: "/notas-entrada", rotulo: "Notas de entrada", icone: FileInput },
      { href: "/trocas", rotulo: "Trocas", icone: RefreshCcw },
      { href: "/entregas", rotulo: "Entregas", icone: Bike },
    ],
  },
  {
    titulo: "Comercial",
    itens: [
      { href: "/cupons", rotulo: "Cupons", icone: Ticket },
      { href: "/upsell", rotulo: "Upsell", icone: TrendingUp },
      { href: "/campanhas", rotulo: "Campanhas", icone: Megaphone },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro", rotulo: "Dashboard", icone: Wallet },
      { href: "/financeiro/contas", rotulo: "Contas bancárias", icone: Landmark },
      { href: "/financeiro/receber", rotulo: "Contas a receber", icone: ArrowDownCircle },
      { href: "/financeiro/pagar", rotulo: "Contas a pagar", icone: ArrowUpCircle },
      { href: "/financeiro/categorias", rotulo: "Categorias", icone: Tags },
    ],
  },
  {
    titulo: "Relatórios",
    itens: [
      { href: "/relatorios", rotulo: "Geral", icone: BarChart3 },
      { href: "/relatorios/vendas", rotulo: "Vendas", icone: LineChart },
      { href: "/relatorios/estoque", rotulo: "Estoque", icone: PieChart },
      { href: "/relatorios/chatbot", rotulo: "Chatbot", icone: Bot },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/configuracoes", rotulo: "Configurações", icone: Settings },
      { href: "/usuarios", rotulo: "Usuários", icone: UserCog },
      { href: "/permissoes", rotulo: "Permissões", icone: Shield },
      { href: "/integracoes", rotulo: "Integrações", icone: Plug },
      { href: "/impressao", rotulo: "Impressão", icone: Printer },
      { href: "/logs", rotulo: "Logs", icone: ScrollText },
    ],
  },
];

export const TITULOS: Record<string, { titulo: string; descricao: string }> = {
  "/": { titulo: "Dashboard", descricao: "Resultado da operação em tempo real" },
  "/painel-atendimento": { titulo: "Painel de atendimento", descricao: "Desempenho do chatbot e da equipe" },
  "/chats": { titulo: "Conversas", descricao: "Caixa de entrada única — WhatsApp e Instagram" },
  "/kanban": { titulo: "Kanban de leads", descricao: "Funil vinculado às conversas" },
  "/clientes": { titulo: "Clientes", descricao: "Base completa da operação" },
  "/calendario": { titulo: "Calendário", descricao: "Rotinas e compromissos da loja" },
  "/tarefas": { titulo: "Tarefas", descricao: "Pendências abertas por bot, sistema e equipe" },
  "/pedidos": { titulo: "Pedidos", descricao: "Todas as vendas da operação" },
  "/catalogo": { titulo: "Catálogo", descricao: "Produto + sabor: a unidade real de estoque" },
  "/produtos": { titulo: "Produtos", descricao: "Marcas, modelos, preços e custos" },
  "/sabores": { titulo: "Sabores", descricao: "Sabores cadastrados e disponibilidade" },
  "/estoque": { titulo: "Estoque", descricao: "Saldos, reservas e movimentações" },
  "/notas-entrada": { titulo: "Notas de entrada", descricao: "Entrada de mercadoria e custo médio" },
  "/trocas": { titulo: "Trocas", descricao: "Solicitações vinculadas à venda original" },
  "/entregas": { titulo: "Entregas", descricao: "Rota do dia e valores a receber" },
  "/cupons": { titulo: "Cupons", descricao: "Descontos e regras de uso" },
  "/upsell": { titulo: "Upsell", descricao: "Ofertas automáticas no fechamento" },
  "/campanhas": { titulo: "Campanhas", descricao: "Origem e performance de aquisição" },
  "/financeiro": { titulo: "Financeiro", descricao: "Entradas, saídas e resultado" },
  "/relatorios": { titulo: "Relatórios", descricao: "Indicadores consolidados" },
  "/configuracoes": { titulo: "Configurações", descricao: "Tudo que o bot e a operação consultam" },
  "/usuarios": { titulo: "Usuários", descricao: "Equipe e níveis de acesso" },
  "/permissoes": { titulo: "Permissões", descricao: "Controle fino por perfil" },
  "/integracoes": { titulo: "Integrações", descricao: "WhatsApp, Instagram, PIX e impressora" },
  "/impressao": { titulo: "Impressão", descricao: "Comandas e fila de impressão" },
  "/logs": { titulo: "Logs", descricao: "Auditoria de alterações críticas" },
};
