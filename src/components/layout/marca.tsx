import Image from "next/image";
import { cn } from "@/lib/utils";

/** Símbolo da marca — o diamante com a fumaça. */
export function Simbolo({
  tamanho = 28, className, tridimensional = true,
}: { tamanho?: number; className?: string; tridimensional?: boolean }) {
  return (
    <Image
      src={tridimensional ? "/marca/simbolo-3d.png" : "/marca/simbolo-branco.png"}
      alt="Luxx Pods"
      width={tamanho * 2}
      height={tamanho * 2}
      priority
      quality={95}
      className={cn("shrink-0 select-none object-contain", className)}
      style={{ width: tamanho, height: tamanho }}
    />
  );
}

/** Assinatura completa: símbolo + wordmark. */
export function Wordmark({
  altura = 14, className,
}: { altura?: number; className?: string }) {
  return (
    <Image
      src="/marca/wordmark-branco.png"
      alt="Luxx Pods"
      width={Math.round(altura * 5.17) * 2}
      height={altura * 2}
      priority
      quality={95}
      className={cn("select-none object-contain", className)}
      style={{ height: altura, width: "auto" }}
    />
  );
}
