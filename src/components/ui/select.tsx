"use client";

import * as React from "react";
import { Seletor, type Opcao } from "./seletor";

/**
 * Mantém a API do <select> nativo (value/onChange/<option>) mas desenha o
 * seletor próprio do painel. Assim nenhuma tela precisou ser reescrita e
 * nenhum controle herda a aparência do sistema operacional.
 */
export function Select({
  value, onChange, children, className, disabled, id, "aria-label": ariaLabel,
}: {
  value?: string | number | readonly string[];
  onChange?: (e: { target: { value: string } }) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const opcoes: Opcao[] = [];

  // lê as <option> declaradas como filhos, inclusive as vindas de .map()
  const percorrer = (nos: React.ReactNode) => {
    React.Children.forEach(nos, (no) => {
      if (!React.isValidElement(no)) return;
      if (no.type === "option") {
        const props = no.props as {
          value?: string | number;
          children?: React.ReactNode;
          disabled?: boolean;
        };
        opcoes.push({
          valor: String(props.value ?? ""),
          rotulo: React.Children.toArray(props.children).join(""),
          desabilitada: props.disabled,
        });
      } else {
        percorrer((no.props as { children?: React.ReactNode }).children);
      }
    });
  };
  percorrer(children);

  return (
    <Seletor
      id={id}
      valor={value != null ? String(value) : null}
      opcoes={opcoes}
      aoMudar={(v) => onChange?.({ target: { value: v } })}
      disabled={disabled}
      className={className}
      placeholder={ariaLabel ?? "Selecione…"}
    />
  );
}
