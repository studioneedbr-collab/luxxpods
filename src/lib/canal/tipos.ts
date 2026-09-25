/**
 * Contrato do canal de mensagens.
 *
 * O resto do sistema fala com esta interface, nunca com a API da Meta ou da
 * Z-API direto. Trocar de provedor — ou rodar sem nenhum, na base de
 * demonstração — não muda uma linha do motor de conversa.
 */

export type TipoConteudo = "texto" | "imagem" | "documento" | "botoes";

export interface MensagemSaida {
  /** telefone em E.164, só dígitos: 5533912345678 */
  para: string;
  tipo: TipoConteudo;
  texto?: string;
  /** URL pública do arquivo */
  arquivo?: string;
  legenda?: string;
  botoes?: Array<{ id: string; rotulo: string }>;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** id da mensagem no provedor, para casar o status depois */
  idExterno?: string;
  erro?: string;
  /** true quando vale a pena tentar de novo (rede, limite); false quando não (número inválido) */
  tentarDeNovo?: boolean;
}

export interface MensagemEntrada {
  idExterno: string;
  de: string;
  nome?: string;
  tipo: TipoConteudo | "audio" | "video" | "localizacao" | "desconhecido";
  texto?: string;
  arquivo?: string;
  /** resposta de botão: qual foi apertado */
  botaoId?: string;
  recebidaEm: Date;
}

export interface AtualizacaoStatus {
  idExterno: string;
  status: "enviada" | "entregue" | "lida" | "erro";
  erro?: string;
  em: Date;
}

export interface EventoCanal {
  /** id único do evento, para não processar duas vezes */
  id: string;
  mensagens: MensagemEntrada[];
  statusAtualizados: AtualizacaoStatus[];
}

export interface Canal {
  nome: string;
  /** pronto para enviar? */
  configurado(): boolean;
  enviar(mensagem: MensagemSaida): Promise<ResultadoEnvio>;
  /** traduz o corpo bruto do webhook para o formato de casa */
  interpretarWebhook(corpo: unknown): EventoCanal | null;
  /** confere que o webhook veio mesmo do provedor */
  validarAssinatura?(corpo: string, assinatura: string | null): boolean;
}
