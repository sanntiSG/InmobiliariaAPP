/* Imagen / orbe que ocupa el lugar del asesor mientras carga el 3D o si no hay WebGL. */
export function MascotFallback({ poster, calm = false }: { poster: string | null; calm?: boolean }) {
  return (
    <div className="advisor-fallback" data-calm={calm ? "true" : undefined} aria-hidden="true">
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
