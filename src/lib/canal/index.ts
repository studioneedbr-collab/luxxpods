import { CanalMeta } from "./meta";
import { CanalSimulado } from "./simulado";
import { CanalZApi } from "./zapi";
import type { Canal } from "./tipos";

export * from "./tipos";
export { CanalMeta, CanalZApi, CanalSimulado };

let cache: Canal | null = null;

/**
 * Qual canal está no ar.
 *
 * A Meta tem prioridade: é a via oficial, com status de entrega e sem risco
 * de banimento. A Z-API entra quando não há conta comercial ainda. Sem
 * nenhum dos dois, o simulado mantém o sistema exercitável.
 */
export function canalAtivo(): Canal {
  if (cache) return cache;

  const meta = new CanalMeta();
  if (meta.configurado()) return (cache = meta);

  const zapi = new CanalZApi();
  if (zapi.configurado()) return (cache = zapi);

  return (cache = new CanalSimulado());
}

/** Descobre de qual provedor veio o webhook pelo formato do corpo. */
export function canalDoWebhook(corpo: unknown): Canal | null {
  const c = corpo as Record<string, unknown>;

  if (c?.object === "whatsapp_business_account" || Array.isArray(c?.entry)) {
    return new CanalMeta();
  }
  if (c?.instanceId || c?.messageId || c?.phone) {
    return new CanalZApi();
  }
  return null;
}
