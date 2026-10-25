/**
 * Cómo se llama y cómo se ve de lejos cada diseño de publicación. Es el mismo orden que `TEMPLATES` (templates.tsx): el
 * número es el `templateId` que guarda la receta. Módulo sin JSX ni servidor, para poder mostrarlos en pantalla (miniaturas
 * dibujadas con CSS, sin pedirle al servidor una imagen por diseño).
 */
export type TemplateLayout = "full" | "split" | "frame" | "column" | "card" | "dark";

export type TemplateMeta = { id: number; name: string; hint: string; layout: TemplateLayout };

export const TEMPLATE_META: readonly TemplateMeta[] = [
  { id: 0, name: "Editorial", hint: "Foto completa con el precio bien grande.", layout: "full" },
  { id: 1, name: "Dividida", hint: "Foto arriba y los datos en un panel claro.", layout: "split" },
  { id: 2, name: "Marco", hint: "Foto con marco sobre un fondo crema.", layout: "frame" },
  { id: 3, name: "Columna", hint: "Una columna con el color de tu marca.", layout: "column" },
  { id: 4, name: "Tarjeta", hint: "Una tarjeta flotante sobre la foto.", layout: "card" },
  { id: 5, name: "Noche", hint: "Fondo oscuro, sobrio y elegante.", layout: "dark" },
];

export const templateName = (id: number): string => TEMPLATE_META[id]?.name ?? "Diseño";
