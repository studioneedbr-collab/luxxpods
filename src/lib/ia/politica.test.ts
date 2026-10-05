import { describe, expect, it } from "vitest";
import { FERRAMENTAS } from "../bot/ferramentas";
import { ferramentasDoModelo, podeChamar } from "./politica";

describe("política da IA", () => {
  it("libera toda consulta: o risco nunca esteve em ler", () => {
    for (const f of FERRAMENTAS.filter((x) => !x.escreve)) {
      expect(podeChamar(f.nome).permitida, f.nome).toBe(true);
    }
  });

  it("recusa confirmar_pedido, que é irreversível", () => {
    const v = podeChamar("confirmar_pedido");
    expect(v.permitida).toBe(false);
    if (!v.permitida) expect(v.motivo).toContain("irreversível");
  });

  it("recusa mexer no carrinho, porque isso reserva estoque", () => {
    for (const nome of ["adicionar_carrinho", "remover_carrinho"]) {
      const v = podeChamar(nome);
      expect(v.permitida, nome).toBe(false);
      if (!v.permitida) expect(v.motivo).toMatch(/estoque|reserva/);
    }
  });

  it("recusa criar cobrança", () => {
    expect(podeChamar("criar_pagamento").permitida).toBe(false);
  });

  it("recusa validar maioridade: é trava legal, não inferência", () => {
    const v = podeChamar("validar_maioridade");
    expect(v.permitida).toBe(false);
    if (!v.permitida) expect(v.motivo).toContain("legal");
  });

  it("deixa pedir gente e abrir pendência — é a saída honesta", () => {
    expect(podeChamar("transferir_atendimento").permitida).toBe(true);
    expect(podeChamar("criar_tarefa").permitida).toBe(true);
  });

  it("recusa nome que o modelo inventou", () => {
    const v = podeChamar("apagar_estoque");
    expect(v.permitida).toBe(false);
    if (!v.permitida) expect(v.motivo).toContain("não existe");
  });

  /**
   * Este é o teste que importa de verdade: ele falha se alguém, no futuro,
   * marcar uma ferramenta nova como liberada sem pensar. Qualquer escrita
   * fora das duas conhecidas quebra aqui.
   */
  it("não entrega nenhuma escrita ao modelo além das duas conhecidas", () => {
    const escritas = ferramentasDoModelo().filter((f) => f.escreve).map((f) => f.nome);
    expect(escritas.sort()).toEqual(["criar_tarefa", "transferir_atendimento"]);
  });

  it("entrega ao modelo todas as consultas que existem", () => {
    const leituras = FERRAMENTAS.filter((f) => !f.escreve).length;
    expect(ferramentasDoModelo().filter((f) => !f.escreve)).toHaveLength(leituras);
  });
});
