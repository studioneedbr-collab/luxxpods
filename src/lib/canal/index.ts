import { CanalFluxoApi } from "./fluxoapi";
import { CanalMeta } from "./meta";
import { CanalSimulado } from "./simulado";
import { CanalZApi } from "./zapi";
import type { Canal } from "./tipos";

export * from "./tipos";
export { CanalFluxoApi, CanalMeta, CanalZApi, CanalSimulado };

let cache: Canal | null = null;

/**
 * Qual canal está no ar.
 *
 * A FluxoAPI vem primeiro: é a Cloud API oficial da Meta por baixo — logo,
 * status de entrega e zero risco de banimento — e ainda deixa o número
 * funcionando no celular do dono, avisando quando ele responde por lá. A
 * Meta direto vem depois, para quem já tem conta comercial própria. A Z-API
 * fica como último recurso, e é a única com risco de banimento. Sem nenhum,
 * o simulado mantém o sistema exercitável.
 */
export function canalAtivo(): Canal {
  if (cache) return cache;

  const fluxo = new CanalFluxoApi();
  if (fluxo.configurado()) return (cache = fluxo);

  const meta = new CanalMeta();
  if (meta.configurado()) return (cache = meta);

  const zapi = new CanalZApi();
  if (zapi.configurado()) return (cache = zapi);

  return (cache = new CanalSimulado());
}

/** Descobre de qual provedor veio o webhook pelo formato do corpo. */
export function canalDoWebhook(corpo: unknown): Canal | null {
  const c = corpo as Record<string, unknown>;

  /**
   * A FluxoAPI é a primeira a ser conferida porque o formato dela é o mais
   * específico: `type` com ponto e `instance_id` juntos. Deixar para depois
   * da Z-API faria o `instanceId` dela puxar o evento errado.
   */
  if (typeof c?.type === "string" && c.type.includes(".") && "instance_id" in (c ?? {})) {
    return new CanalFluxoApi();
  }
  if (c?.object === "whatsapp_business_account" || Array.isArray(c?.entry)) {
    return new CanalMeta();
  }
  if (c?.instanceId || c?.messageId || c?.phone) {
    return new CanalZApi();
  }
  return null;
}
