/**
 * Imagen / orbe que ocupa el lugar del asesor mientras carga el 3D o si no hay WebGL. Siempre se adapta a la caja que lo contiene
 * (ver `.advisor-orb`: toma el menor entre su ancho y su alto). `progress` (0 a 1) dibuja un aro fino alrededor del orbe con lo
 * que ya se descargó del modelo, cuando el navegador lo informa.
 */
export function MascotFallback({ poster, calm = false, progress = null }: { poster: string | null; calm?: boolean; progress?: number | null }) {
  const shown = progress != null && progress > 0 && progress < 1 ? Math.round(progress * 100) : null;
  return (
    <div
      className="advisor-fallback"
      data-calm={calm ? "true" : undefined}
      data-progress={shown != null && !poster ? "" : undefined}
      style={shown != null ? ({ "--p": shown } as React.CSSProperties) : undefined}
      aria-hidden="true"
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- póster chico y propio; no necesita el optimizador
        <img src={poster} alt="" className="advisor-fallback-poster" draggable={false} />
      ) : (
        <span className="advisor-orb">
          <span className="advisor-orb-eye" />
          <span className="advisor-orb-eye" />
        </span>
      )}
    </div>
  );
}
