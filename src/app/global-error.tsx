"use client";

/** Último recurso: erro que derrubou até o layout raiz. */
export default function ErroGlobal({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{
        background: "#07070b", color: "#ececf5", minHeight: "100vh",
        display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif",
        margin: 0, padding: 16,
      }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            O sistema não conseguiu iniciar
          </h1>
          <p style={{ fontSize: 13, color: "#9a9ab5", marginTop: 8, lineHeight: 1.6 }}>
            Nenhum dado foi perdido. Tente carregar novamente — se persistir,
            reinicie o servidor.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#6b6b87", marginTop: 8 }}>
              código: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 20, height: 36, padding: "0 20px", border: "none",
              borderRadius: 8, background: "#7c3aed", color: "#fff",
              fontSize: 14, fontWeight: 500, cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
