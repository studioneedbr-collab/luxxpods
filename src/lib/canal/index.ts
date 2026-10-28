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

/**
 * Descobre de qual provedor veio o webhook pelo formato do corpo — e só
 * aceita o provedor que está NO AR.
 *
 * Escolher só pelo corpo deixava um atalho: com a Z-API protegida por
 * segredo, um corpo com `entry: []` caía no tratador da Meta, que sem
 * segredo próprio aceitava tudo.
 */
export function canalDoWebhook(corpo: unknown): Canal | null {
  const c = corpo as Record<string, unknown>;

  const pelo = c?.object === "whatsapp_business_account" || Array.isArray(c?.entry)
    ? new CanalMeta()
    : c?.instanceId || c?.messageId || c?.phone ? new CanalZApi() : null;
  if (!pelo) return null;

  // fora de produção, sem canal configurado, o webhook continua testável
  if (process.env.NODE_ENV !== "production") return pelo;
  return canalAtivo().nome === pelo.nome ? pelo : null;
}
