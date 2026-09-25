/**
 * O que a loja ajusta sem precisar de deploy.
 *
 * Cada grupo vira uma linha em `settings`, com um objeto JSON. O banco já lê
 * daqui (taxa de entrega em `recalcular_carrinho`, tempo de reserva em
 * `abrir_carrinho`, follow-up em `agendarFollowup`), então mudar aqui muda o
 * comportamento na próxima mensagem — sem publicar versão nova.
 */

export interface ConfigEmpresa {
  nome: string;
  telefone: string;
  endereco: string;
  logo_url: string | null;
}

export interface ConfigAtendimento {
  horario_inicio: string;
  horario_fim: string;
  mensagem_inicial: string;
  mensagem_fora_horario: string;
  followup_minutos: number;
  followup_ativo: boolean;
}

export interface ConfigChatbot {
  ativo: boolean;
  validar_maioridade: boolean;
  nome_bot: string;
  fallback_humano: boolean;
}

export interface ConfigCatalogo {
  arquivo_png: string | null;
  enviar_automatico: boolean;
  mostrar_esgotados: boolean;
}

export interface ConfigEntrega {
  taxa_padrao: number;
  taxa_gratis_acima: number;
  prazo_minutos: number;
}

export interface ConfigPagamentos {
  pix_ativo: boolean;
  dinheiro_ativo: boolean;
  cartao_ativo: boolean;
  chave_pix: string | null;
  gateway: string | null;
}

export interface ConfigEstoque {
  reserva_minutos: number;
  estoque_minimo_padrao: number;
  bloquear_venda_sem_estoque: boolean;
}

export interface ConfigImpressao {
  impressora_padrao: string | null;
  vias: number;
  automatica: boolean;
}

export interface ConfigEnvios {
  transacional: boolean;
  interno: boolean;
  cobranca: boolean;
  marketing: boolean;
}

export interface Configuracoes {
  empresa: ConfigEmpresa;
  atendimento: ConfigAtendimento;
  chatbot: ConfigChatbot;
  catalogo: ConfigCatalogo;
  entrega: ConfigEntrega;
  pagamentos: ConfigPagamentos;
  estoque: ConfigEstoque;
  impressao: ConfigImpressao;
  whatsapp_envios: ConfigEnvios;
}

export type ChaveConfig = keyof Configuracoes;

/**
 * O que vale quando a loja ainda não mexeu em nada.
 * Também é a rede de segurança: linha faltando no banco não deixa o sistema
 * sem valor, cai aqui.
 */
export const PADRAO: Configuracoes = {
  empresa: {
    nome: "Luxx Pods",
    telefone: "",
    endereco: "Teófilo Otoni - MG",
    logo_url: null,
  },
  atendimento: {
    horario_inicio: "10:00",
    horario_fim: "23:59",
    mensagem_inicial: "Fala! Aqui é da Luxx Pods 🖤 Como posso te ajudar?",
    mensagem_fora_horario: "Estamos fechados agora. Voltamos às 10h!",
    followup_minutos: 5,
    followup_ativo: true,
  },
  chatbot: {
    ativo: true,
    validar_maioridade: true,
    nome_bot: "Luxx",
    fallback_humano: true,
  },
  catalogo: {
    arquivo_png: null,
    enviar_automatico: true,
    mostrar_esgotados: false,
  },
  entrega: {
    taxa_padrao: 5,
    taxa_gratis_acima: 150,
    prazo_minutos: 45,
  },
  pagamentos: {
    pix_ativo: true,
    dinheiro_ativo: true,
    cartao_ativo: false,
    chave_pix: null,
    gateway: null,
  },
  estoque: {
    reserva_minutos: 15,
    estoque_minimo_padrao: 3,
    bloquear_venda_sem_estoque: true,
  },
  impressao: {
    impressora_padrao: null,
    vias: 1,
    automatica: true,
  },
  whatsapp_envios: {
    // sem configuração explícita, só o transacional sai — marketing pausado
    // é o que protege o número de banimento
    transacional: true,
    interno: true,
    cobranca: false,
    marketing: false,
  },
};

export interface ProblemaConfig {
  campo: string;
  erro: string;
}

/**
 * Confere o que faria a operação se comportar mal.
 * Recusar com motivo é melhor que aceitar e quebrar em silêncio na venda.
 */
export function validar(chave: ChaveConfig, valor: unknown): ProblemaConfig[] {
  const v = valor as Record<string, unknown>;
  const problemas: ProblemaConfig[] = [];

  const numero = (campo: string, min: number, max: number, rotulo: string) => {
    const n = Number(v[campo]);
    if (Number.isNaN(n)) problemas.push({ campo, erro: `${rotulo} precisa ser um número` });
    else if (n < min || n > max) {
      problemas.push({ campo, erro: `${rotulo} deve ficar entre ${min} e ${max}` });
    }
  };

  switch (chave) {
    case "atendimento": {
      const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!hora.test(String(v.horario_inicio))) {
        problemas.push({ campo: "horario_inicio", erro: "Use o formato 10:00" });
      }
      if (!hora.test(String(v.horario_fim))) {
        problemas.push({ campo: "horario_fim", erro: "Use o formato 23:59" });
      }
      numero("followup_minutos", 1, 1440, "O tempo de follow-up");
      if (!String(v.mensagem_inicial ?? "").trim()) {
        problemas.push({ campo: "mensagem_inicial", erro: "A primeira mensagem não pode ficar vazia" });
      }
      break;
    }

    case "entrega":
      numero("taxa_padrao", 0, 999, "A taxa de entrega");
      numero("taxa_gratis_acima", 0, 99999, "O valor para entrega grátis");
      numero("prazo_minutos", 1, 1440, "O prazo de entrega");
      break;

    case "estoque":
      // reserva curta demais tira a peça do cliente no meio da conversa
      numero("reserva_minutos", 5, 240, "O tempo de reserva");
      numero("estoque_minimo_padrao", 0, 999, "O estoque mínimo");
      break;

    case "pagamentos":
      if (!v.pix_ativo && !v.dinheiro_ativo && !v.cartao_ativo) {
        problemas.push({
          campo: "pix_ativo",
          erro: "Deixe ao menos uma forma de pagamento ativa, senão ninguém consegue comprar",
        });
      }
      if (v.pix_ativo && !String(v.chave_pix ?? "").trim()) {
        problemas.push({
          campo: "chave_pix",
          erro: "Com PIX ativo, a chave é obrigatória — é ela que gera o código de pagamento",
        });
      }
      break;

    case "impressao":
      numero("vias", 1, 5, "O número de vias");
      break;

    case "empresa":
      if (!String(v.nome ?? "").trim()) {
        problemas.push({ campo: "nome", erro: "O nome da loja aparece na comanda e nas mensagens" });
      }
      break;
  }

  return problemas;
}
