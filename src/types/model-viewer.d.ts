// Declara el custom element <model-viewer> (@google/model-viewer) para JSX/TS.
// A propósito, sin imports/exports a nivel de módulo: así el archivo se
// trata como "script" global y el namespace React.JSX se fusiona con el de
// @types/react en vez de reemplazarlo (ver declare namespace React ahí).

interface ModelViewerAttributes {
  src?: string;
  alt?: string;
  poster?: string;
  ar?: boolean;
  "ar-modes"?: string;
  "camera-controls"?: boolean;
  "auto-rotate"?: boolean;
  "shadow-intensity"?: string | number;
  exposure?: string | number;
  loading?: "auto" | "lazy" | "eager";
  reveal?: "auto" | "interaction" | "manual";
}

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> &
        ModelViewerAttributes;
    }
  }
}
