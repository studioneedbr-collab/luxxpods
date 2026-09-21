import { brl, dataHora, telefone } from "@/lib/utils";
import { METODO_PAGAMENTO } from "@/lib/labels";
import type { Pedido } from "@/lib/types";

/**
 * Cupom não fiscal / comanda de pedido.
 * Fica oculta na tela e aparece somente na impressão (80mm).
 */
export function Comanda({ pedido }: { pedido: Pedido }) {
  const pago = pedido.status_pagamento === "aprovado";
  const dinheiro = pedido.forma_pagamento === "dinheiro";

  return (
    <div className="comanda hidden print:block">
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1 }}>LUXX PODS</h1>
        <p style={{ fontSize: 10 }}>CUPOM NÃO FISCAL · COMANDA DE PEDIDO</p>
      </div>

      <hr />
      <p style={{ fontSize: 15, fontWeight: 800, textAlign: "center", margin: "6px 0" }}>
        {pedido.numero_pedido}
      </p>
      <p style={{ fontSize: 10, textAlign: "center" }}>{dataHora(pedido.created_at)}</p>
      <hr />

      <table style={{ width: "100%", fontSize: 11, marginTop: 6 }}>
        <tbody>
          <tr><td><b>Cliente</b></td><td style={{ textAlign: "right" }}>{pedido.cliente_nome}</td></tr>
          <tr><td><b>Telefone</b></td><td style={{ textAlign: "right" }}>{telefone(pedido.cliente_telefone)}</td></tr>
        </tbody>
      </table>

      {pedido.endereco_snapshot && (
        <>
          <hr />
          <p style={{ fontSize: 11, fontWeight: 700 }}>ENTREGA</p>
          <p style={{ fontSize: 11 }}>
            {pedido.endereco_snapshot.rua}, {pedido.endereco_snapshot.numero}
          </p>
          <p style={{ fontSize: 11 }}>
            {pedido.endereco_snapshot.bairro} — {pedido.endereco_snapshot.cidade}
          </p>
          {pedido.endereco_snapshot.complemento && (
            <p style={{ fontSize: 11 }}>{pedido.endereco_snapshot.complemento}</p>
          )}
          {pedido.endereco_snapshot.referencia && (
            <p style={{ fontSize: 11 }}>Ref: {pedido.endereco_snapshot.referencia}</p>
          )}
        </>
      )}

      <hr />
      <table style={{ width: "100%", fontSize: 11 }}>
        <tbody>
          {(pedido.itens ?? []).map((i) => (
            <tr key={i.id}>
              <td style={{ paddingBottom: 4 }}>
                <b>{i.quantidade}x {i.produto_nome}</b>
                <br />
                <span style={{ fontSize: 10 }}>{i.sabor_nome}</span>
              </td>
              <td style={{ textAlign: "right", verticalAlign: "top" }}>{brl(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />
      <table style={{ width: "100%", fontSize: 11 }}>
        <tbody>
          <tr><td>Produtos</td><td style={{ textAlign: "right" }}>{brl(pedido.subtotal)}</td></tr>
          {pedido.desconto > 0 && (
            <tr><td>Desconto</td><td style={{ textAlign: "right" }}>- {brl(pedido.desconto)}</td></tr>
          )}
          <tr><td>Entrega</td><td style={{ textAlign: "right" }}>{brl(pedido.taxa_entrega)}</td></tr>
          <tr style={{ fontSize: 15, fontWeight: 900 }}>
            <td style={{ paddingTop: 4 }}>TOTAL</td>
            <td style={{ textAlign: "right", paddingTop: 4 }}>{brl(pedido.total)}</td>
          </tr>
          <tr><td>Pagamento</td>
            <td style={{ textAlign: "right" }}>{METODO_PAGAMENTO[pedido.forma_pagamento]}</td></tr>
        </tbody>
      </table>

      <hr />

      {dinheiro && !pago ? (
        <div style={{ textAlign: "center", border: "2px solid #000", padding: 6, margin: "6px 0" }}>
          <p style={{ fontSize: 17, fontWeight: 900 }}>⚠ RECEBER NA ENTREGA</p>
          <p style={{ fontSize: 19, fontWeight: 900 }}>{brl(pedido.total)}</p>
          {pedido.troco_para ? (
            <p style={{ fontSize: 13, fontWeight: 700 }}>
              Troco para {brl(pedido.troco_para)} — levar {brl(pedido.valor_troco ?? 0)}
            </p>
          ) : (
            <p style={{ fontSize: 11 }}>Sem troco</p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 15, fontWeight: 900, textAlign: "center", margin: "6px 0" }}>
          ✓ PEDIDO PAGO
        </p>
      )}

      {pedido.observacoes && (
        <>
          <hr />
          <p style={{ fontSize: 11 }}><b>Obs:</b> {pedido.observacoes}</p>
        </>
      )}

      <hr />
      <p style={{ fontSize: 10, textAlign: "center", marginTop: 6 }}>
        Obrigado pela preferência 🖤
      </p>
      <p style={{ fontSize: 9, textAlign: "center" }}>Venda proibida para menores de 18 anos.</p>
    </div>
  );
}
