// Browser capability probes. Each is safe to call outside a browser (returns the conservative answer).

// A 16x16 AVIF made with the same encoder as the plates; decoding it proves AVIF support.
const AVIF_PROBE = 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAGgAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAEAAAABAAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAIm1kYXQSAAoGGAz/2BCAMg4ZgBBBBAQAAGQGO/hszg==';

let avifProbe;

export function supportsAvif() {
  if (!avifProbe) {
    avifProbe = (async () => {
      if (typeof createImageBitmap !== 'function' || typeof atob !== 'function') return false;
      try {
        const bytes = Uint8Array.from(atob(AVIF_PROBE), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/avif' }));
        bitmap.close?.();
        return true;
      } catch {
        return false;
      }
    })();
  }
  return avifProbe;
}

export function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** True on Save-Data or a slow connection: pick the small variant and skip background preloading. */
export function constrainedNetwork() {
  const connection = globalThis.navigator?.connection;
  return Boolean(connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ''));
}
