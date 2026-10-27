/** Textos y cifras estáticas de las secciones de la landing (debajo del hero). */
export const SHOWCASE = {
  eyebrow: "Cómo funciona",
  title: "Recorré, ubicá y elegí antes de salir de casa.",
  frame: {
    title: "Recorrido 360°",
    text: "Entrá a cada ambiente desde el celular y pasá de uno a otro como si estuvieras ahí.",
    hotspots: ["Living", "Cocina", "Balcón"],
  },
  cards: [
    {
      title: "Mapa gratuito de AMBA",
      text: "Todas las propiedades en un mapa, con filtros por zona, precio y recorrido 360°. Sin límites ni costo.",
    },
    {
      title: "Tu espacio",
      text: "Guardá, dale me gusta y recibí recomendaciones con su motivo: sabés por qué te la mostramos.",
    },
  ],
} as const;

export const AGENCIES = {
  eyebrow: "Para inmobiliarias",
  title: "Tu vitrina, tu panel y tus datos en un solo lugar.",
  signals: [
    { value: 9, label: "indicadores con variación semanal" },
    { value: 12, label: "diagnósticos automáticos por propiedad" },
    { value: 6, label: "plantillas listas para redes" },
  ],
  cards: [
    {
      title: "Resumen inteligente",
      text: "Visitas, favoritos y consultas contra la semana anterior, en lenguaje simple.",
      kind: "trend",
    },
    {
      title: "Centro de oportunidades",
      text: "Te decimos qué mejorar y dónde: fotos, un recorrido 360° o una nueva propiedad.",
      kind: "tips",
    },
    {
      title: "Clientes y redes",
      text: "Seguí cada consulta hasta cerrarla y descargá publicaciones listas para compartir.",
      kind: "leads",
    },
  ],
} as const;

export const CLOSING = {
  title: "Entrá antes de entrar.",
  text: "Explorá sin cuenta o sumá tu inmobiliaria a la plataforma.",
} as const;

/**
 * La sección de agentes de la portada. Los NOMBRES de los agentes no están acá: los define el admin y salen de lo publicado (ver
 * `lib/agents/home.ts`). Estos textos son genéricos a propósito, para que sigan valiendo si el admin cambia nombres o apaga alguno.
 */
export const AGENTS_SECTION = {
  eyebrow: "Agentes",
  title: "Agentes que conocen la plataforma y te ahorran trabajo.",
  lead: "Cada uno se ocupa de una cosa y todos comparten lo que saben, con los datos reales y sin inteligencia artificial de pago.",
  /** Texto de las mini-escenas decorativas de cada tarjeta (no son datos de nadie). */
  scenes: {
    advisor: { question: "¿Qué conviene revisar primero?", answer: ["Fotos de la casa de Canning", "Precio del PH de Villa Crespo", "Videos para la oficina"] },
    marketing: { chip: "Imagen lista", tags: ["#Venta", "#Palermo", "#Recorrido360"] },
    mail: { rows: [{ text: "Consulta por la casa de Canning", state: "Respondida", done: true }, { text: "¿Aceptan mascotas?", state: "Para confirmar", done: false }] },
  },
} as const;
