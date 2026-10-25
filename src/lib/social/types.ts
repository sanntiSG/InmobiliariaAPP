/**
 * Formas de los datos de "Contenido para redes" que viajan entre el servidor y la pantalla. Sin base de datos ni servidor:
 * las importan tanto el motor como los componentes (la pantalla clásica y el agente de marketing).
 */
export type SocialMode = "auto" | "manual";

export type SocialState = {
  mode: SocialMode | null;
  current: {
    propertyId: string;
    title: string;
    templateId: number;
    version: number;
    /** Foto elegida y el resto de las fotos elegibles de la propiedad (para cambiarla). */
    photoUrl: string;
    photos: string[];
  } | null;
  nextReady: boolean;
  /** `null` = sin límite (admin). */
  regenLeft: number | null;
  properties: { id: string; title: string; photo: string }[];
};

/** Una propiedad sugerida para promocionar, con el porqué en lenguaje natural. */
export type SocialSuggestion = {
  id: string;
  title: string;
  photo: string;
  reasons: string[];
  /** Una frase lista para mostrar ("Recibe interés sostenido (45 visitas en 30 días) y tiene recorrido 360°, que la diferencia."). */
  note: string;
};

export type SocialCaptionPayload = { text: string; hashtags: string[]; full: string };

/** Qué se le puede pedir al motor al generar: todo opcional (lo que falte lo elige la plataforma). */
export type GenerateRequest = { propertyId?: string; templateId?: number; photoUrl?: string };
