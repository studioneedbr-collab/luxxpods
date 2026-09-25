/**
 * BR Code — o "PIX copia e cola" do Banco Central.
 *
 * É um payload EMV®QRCPS montado em campos de tamanho declarado, fechado com
 * um CRC16. Não precisa de gateway: com a chave da loja dá para gerar um
 * código válido, que qualquer banco lê. O que um gateway acrescenta é a
 * confirmação automática — sem ele, alguém confere o comprovante.
 */

/** Campo EMV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
function campo(id: string, valor: string): string {
  const tamanho = String(valor.length).padStart(2, "0");
  return `${id}${tamanho}${valor}`;
}

/**
 * CRC16/CCITT-FALSE, como a especificação exige.
 * Calculado sobre o payload inteiro já com "6304" no fim.
 */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acento e o que a especificação não aceita nos campos de texto. */
function limpar(texto: string, limite: number): string {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, limite)
    .toUpperCase();
}

export interface DadosPix {
  /** CPF, CNPJ, e-mail, telefone ou chave aleatória */
  chave: string;
  /** nome do recebedor, até 25 caracteres */
  nome: string;
  /** cidade do recebedor, até 15 caracteres */
  cidade: string;
  /** valor exato; omitido deixa o pagador escolher */
  valor?: number;
  /** identificador do pagamento, até 25 caracteres — é o que casa o PIX com o pedido */
  identificador?: string;
}

/**
 * Monta o código copia e cola.
 *
 * O identificador é o que permite reconhecer o pagamento depois: colocamos o
 * número do pedido ali, então o comprovante chega com ele.
 */
export function gerarBrCode(dados: DadosPix): string {
  const chave = dados.chave.trim();
  if (!chave) throw new Error("Chave PIX não configurada");

  const identificador = dados.identificador
    ? limpar(dados.identificador, 25).replace(/ /g, "")
    : "***";

  // conta do recebedor: BR.GOV.BCB.PIX + chave
  const conta = campo("00", "BR.GOV.BCB.PIX") + campo("01", chave);

  const partes = [
    campo("00", "01"),                               // formato do payload
    campo("26", conta),                              // dados da conta PIX
    campo("52", "0000"),                             // categoria do comerciante
    campo("53", "986"),                              // moeda: real
    ...(dados.valor && dados.valor > 0
      ? [campo("54", dados.valor.toFixed(2))]        // valor exato
      : []),
    campo("58", "BR"),                               // país
    campo("59", limpar(dados.nome, 25) || "LUXX PODS"),
    campo("60", limpar(dados.cidade, 15) || "SAO PAULO"),
    campo("62", campo("05", identificador)),         // identificador do pagamento
  ];

  const semCrc = `${partes.join("")}6304`;
  return semCrc + crc16(semCrc);
}

/**
 * Confere um código recebido.
 * Serve para validar o que o cliente colou, antes de dizer que é válido.
 */
export function brCodeValido(codigo: string): boolean {
  if (codigo.length < 8) return false;
  const corpo = codigo.slice(0, -4);
  const crcRecebido = codigo.slice(-4).toUpperCase();
  return crc16(corpo) === crcRecebido;
}

/** Tipo da chave, para exibir formatado na tela. */
export function tipoDaChave(chave: string): "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" {
  const digitos = chave.replace(/\D/g, "");
  if (chave.includes("@")) return "email";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) {
    return "aleatoria";
  }
  if (digitos.length === 11 && chave.startsWith("+")) return "telefone";
  if (digitos.length === 11) return "cpf";
  if (digitos.length === 14) return "cnpj";
  if (digitos.length === 13) return "telefone";
  return "aleatoria";
}
