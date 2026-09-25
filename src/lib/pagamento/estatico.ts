import "server-only";
import QRCode from "qrcode";
import { gerarBrCode } from "../pix/brcode";
import { lerConfiguracoes } from "../actions-config";
import type { Cobranca, DadosCobranca, EventoPagamento, MeioPagamento } from "./tipos";

/**
 * PIX estático, gerado pelo próprio sistema.
 *
 * Funciona sem contratar ninguém: o código é válido e qualquer banco paga.
 * O que falta é a confirmação automática — por isso `confirmacaoAutomatica`
 * é false, e a tela avisa que a baixa é manual em vez de deixar alguém
 * achando que confirma sozinho.
 */
export class MeioEstatico implements MeioPagamento {
  nome = "pix-estatico";
  confirmacaoAutomatica = false;

  configurado() {
    return true;   // só depende da chave, conferida na criação
  }

  async criarCobranca(
    dados: DadosCobranca,
  ): Promise<{ ok: true; cobranca: Cobranca } | { ok: false; erro: string }> {
    const config = await lerConfiguracoes();

    if (!config.pagamentos.chave_pix) {
      return {
        ok: false,
        erro: "Chave PIX não configurada. Cadastre em Configurações → Pagamentos.",
      };
    }

    let copiaECola: string;
    try {
      copiaECola = gerarBrCode({
        chave: config.pagamentos.chave_pix,
        nome: config.empresa.nome,
        cidade: config.empresa.endereco.split("-")[0].trim(),
        valor: dados.total,
        identificador: dados.numeroPedido,
      });
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : "falha ao gerar o código" };
    }

    const qrCode = await QRCode.toDataURL(copiaECola, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#05060c", light: "#ffffff" },
    });

    return {
      ok: true,
      cobranca: { idExterno: dados.numeroPedido, copiaECola, qrCode },
    };
  }

  /** Não há webhook: a confirmação é manual, pela tela do pedido. */
  interpretarWebhook(): EventoPagamento | null {
    return null;
  }
}
