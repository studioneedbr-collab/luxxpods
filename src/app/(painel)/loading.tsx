import { Skeleton } from "@/components/ui";

/** Esqueleto mostrado enquanto os dados da tela chegam do servidor. */
export default function Carregando() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-20" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px]" />
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Skeleton className="h-[320px] xl:col-span-2" />
        <Skeleton className="h-[320px]" />
      </div>

      <Skeleton className="h-64" />
    </div>
  );
}
