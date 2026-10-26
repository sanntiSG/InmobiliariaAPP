/**
 * Lo que dice el agente de marketing en cada paso. Antes eran textos fijos dentro de la pantalla; ahora salen de bancos de frases
 * con variantes (ver `lib/agents/knowledge/phrasing.ts`, la misma voz del asesor y del correo): dos veces que se abre el agente no
 * se repite de memoria, pero cada paso conserva su idea y sus datos. Los pasos y las decisiones no cambian: sólo cómo se dicen.
 */
import { useState } from "react";
import { phrase } from "@/lib/agents/knowledge/phrasing";

/**
 * Un número de arranque para elegir las frases de esta apertura del agente. Cambia entre aperturas (por eso se saluda distinto
 * cada vez) y se mantiene mientras el agente está abierto (los pasos no "saltan" de frase al volver a dibujarse).
 */
export function useSpeechTurn(): number {
  const [turn] = useState(() => Math.floor(Math.random() * 997));
  return turn;
}

export const marketingSpeech = {
  pickAgency: (t: number) =>
    phrase(
      "mk.agency",
      [
        "Hola, soy tu agente de marketing. ¿Para qué inmobiliaria preparamos contenido?",
        "¡Hola! Soy tu agente de marketing. ¿Con qué inmobiliaria trabajamos hoy?",
        "Buenas, soy tu agente de marketing. Decime para qué inmobiliaria armamos contenido.",
      ],
      t
    ),

  loadFailed: (t: number) =>
    phrase("mk.failed", ["No pude cargar tus publicaciones.", "Algo falló al traer tus publicaciones.", "No logré cargar tus publicaciones ahora."], t),

  empty: (t: number) =>
    phrase(
      "mk.empty",
      [
        "Todavía no tengo con qué trabajar: necesito al menos una propiedad publicada con fotos.",
        "Para armar una publicación necesito, como mínimo, una propiedad publicada con fotos. Todavía no tengo ninguna.",
        "Aún no hay nada para promocionar: falta al menos una propiedad publicada con fotos.",
      ],
      t
    ),

  intro: (t: number, name: string) => {
    const who = name ? `${name}, tu` : "tu";
    return phrase(
      "mk.intro",
      [
        `Hola, soy ${who} agente de marketing. Te ayudo a preparar la imagen y el texto de tus publicaciones para redes. Te explico cómo trabajamos, es cortito.`,
        `¡Hola! Soy ${who} agente de marketing. Armo la imagen y el texto de tus publicaciones para redes, paso a paso. Te cuento cómo trabajamos, es rápido.`,
        `Buenas, soy ${who} agente de marketing. Me encargo de la imagen y el texto de tus posteos para redes. Primero una explicación corta de cómo trabajamos.`,
      ],
      t
    );
  },

  mode: (t: number) =>
    phrase(
      "mk.mode",
      ["Primero, ¿cómo querés trabajar? Lo podés cambiar cuando quieras.", "Antes de empezar: ¿cómo preferís trabajar? Lo podés cambiar cuando quieras.", "Primero elegí cómo trabajamos. Después lo cambiás cuando quieras."],
      t
    ),

  chooseAutoPending: (t: number) =>
    phrase(
      "mk.choose.auto",
      ["Todavía no armé la publicación de hoy. ¿La preparo yo?", "La publicación de hoy todavía no está. ¿La armo yo?", "Hoy aún no preparé nada. ¿Querés que la arme yo?"],
      t
    ),

  chooseRecommended: (t: number, title: string) =>
    phrase(
      "mk.choose.pick",
      [
        `Para hoy te recomiendo «${title}». Si te gusta, la preparamos.`,
        `Mi recomendación para hoy es «${title}». Si te parece, la armamos.`,
        `Hoy elegiría «${title}». Si estás de acuerdo, la preparamos.`,
      ],
      t
    ),

  chooseAsk: (t: number) =>
    phrase("mk.choose.ask", ["¿Qué propiedad querés promocionar hoy?", "¿Cuál propiedad promocionamos hoy?", "Decime qué propiedad querés promocionar hoy."], t),

  designNew: (t: number, title: string) =>
    phrase(
      "mk.design.new",
      [
        `Elegiste «${title}». ¿Con qué diseño la armamos? Si preferís, elijo yo.`,
        `Perfecto, «${title}». ¿Qué diseño le ponemos? Si querés, elijo yo.`,
        `«${title}», buena elección. ¿Con qué diseño la hacemos? Si no, elijo yo.`,
      ],
      t
    ),

  designChange: (t: number) =>
    phrase(
      "mk.design.change",
      ["Elegí otro diseño y, si querés, otra foto.", "Probemos con otro diseño y, si querés, con otra foto.", "Cambiá el diseño y, si te gusta, también la foto."],
      t
    ),

  working: (t: number) => phrase("mk.working", ["Preparando tu publicación…", "Armando tu publicación…", "Ya casi está tu publicación…"], t),

  readyNow: (t: number, title: string) =>
    phrase(
      "mk.ready.now",
      [
        `Listo: «${title}». Descargá la imagen y copiá el texto y los hashtags cuando quieras.`,
        `Ya está: «${title}». Descargá la imagen y copiá el texto y los hashtags cuando quieras.`,
        `Quedó lista «${title}». Bajá la imagen y copiá el texto y los hashtags cuando te sirva.`,
      ],
      t
    ),

  readyAuto: (t: number, title: string) =>
    phrase(
      "mk.ready.auto",
      [
        `Hoy te preparé «${title}». Descargá la imagen y copiá el texto y los hashtags cuando quieras.`,
        `Para hoy dejé lista «${title}». Descargá la imagen y copiá el texto y los hashtags cuando quieras.`,
      ],
      t
    ),

  readyToday: (t: number, title: string) =>
    phrase("mk.ready.today", [`Esta es la publicación de hoy: «${title}».`, `Acá tenés la publicación de hoy: «${title}».`], t),
};
