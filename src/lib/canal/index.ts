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

  /**
   * Quem o formato do corpo diz que é.
   *
   * A FluxoAPI vem primeiro porque o formato dela é o mais específico —
   * `type` com ponto e `instance_id` juntos. Conferida depois da Z-API, o
   * `instanceId` dela puxaria o evento errado.
   */
  const pelo = (() => {
    if (typeof c?.type === "string" && c.type.includes(".") && c?.instance_id) {
      return new CanalFluxoApi();
    }
    if (c?.object === "whatsapp_business_account" || Array.isArray(c?.entry)) {
      return new CanalMeta();
    }
    if (c?.instanceId || c?.messageId || c?.phone) return new CanalZApi();
    return null;
  })();

  if (!pelo) return null;

  // fora de produção, sem canal configurado, o webhook continua testável
  if (process.env.NODE_ENV !== "production") return pelo;
  return canalAtivo().nome === pelo.nome ? pelo : null;
}
