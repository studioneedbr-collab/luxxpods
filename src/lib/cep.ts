/**
 * Busca de endereço pelo CEP.
 *
 * É conveniência, nunca obrigação: a Luxx entrega em Teófilo Otoni, onde
 * muita gente não sabe o próprio CEP e o endereço chega pelo ponto de
 * referência. Então uma busca que falha não pode travar a venda — ela só
 * deixa de preencher, e a pessoa digita.
 */

export interface EnderecoDoCep {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
}

/** Só os dígitos: o campo chega mascarado como 39800-000. */
export function limparCep(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

export function cepCompleto(valor: string): boolean {
  return limparCep(valor).length === 8;
}

/**
 * Dois provedores, porque um só cai.
 *
 * A BrasilAPI responde melhor; a ViaCEP é a que todo mundo conhece e serve
 * de reserva. Qualquer uma que responder primeiro com dados completos vale.
 */
export async function buscarCep(valor: string): Promise<EnderecoDoCep | null> {
  const cep = limparCep(valor);
  if (cep.length !== 8) return null;

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if (r.ok) {
      const d = await r.json();
      if (d?.street || d?.neighborhood || d?.city) {
        return {
          cep,
          rua: d.street ?? "",
          bairro: d.neighborhood ?? "",
          cidade: d.city ?? "",
          estado: d.state ?? "",
        };
      }
    }
  } catch {
    /* cai para a reserva */
  }

  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!r.ok) return null;
    const d = await r.json();
    // a ViaCEP responde 200 com { erro: true } para CEP inexistente
    if (d?.erro) return null;
    return {
      cep,
      rua: d.logradouro ?? "",
      bairro: d.bairro ?? "",
      cidade: d.localidade ?? "",
      estado: d.uf ?? "",
    };
  } catch {
    return null;
  }
}
