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
