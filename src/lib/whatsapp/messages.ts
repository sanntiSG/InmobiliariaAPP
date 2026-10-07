import { brand } from "@/config/brand";
import { buildWhatsappLink } from "@/config/site";

/**
 * Mensajes de WhatsApp de la plataforma. Es un módulo puro (sin `"use client"`)
 * a propósito: lo usan tanto el servidor como los formularios del cliente. Una
 * función exportada desde un módulo cliente NO se puede llamar desde un server
 * component — de ahí salía el error "This page couldn't be reloaded".
 *
 * Convención: el **botón** manda un mensaje corto y personalizado; la
 * **tarjeta con formulario** arma uno más detallado con lo que la persona completó.
 */

const clean = (s: string | null | undefined) => (s ?? "").trim();

/** Líneas "• Etiqueta: valor", salteando las que no tienen valor. */
function bullets(rows: [label: string, value: string | null | undefined][]): string {
  return rows
    .filter(([, value]) => clean(value))
    .map(([label, value]) => `• ${label}: ${clean(value)}`)
    .join("\n");
}

/** Botón "Hablar por WhatsApp" de la solicitud de inmobiliaria — mensaje corto. */
export function providerQuickMessage(): string {
  return `Hola! Quisiera publicar mi inmobiliaria en ${brand.name}.`;
}

/** Tarjeta de solicitud de inmobiliaria — detallado, con los datos del formulario. */
export function providerRequestMessage(d: {
  userName?: string | null;
  email?: string | null;
  agencyName: string;
  zone: string;
  phone: string;
  message?: string | null;
}): string {
  const contact = [clean(d.userName), clean(d.email) && `(${clean(d.email)})`].filter(Boolean).join(" ");
  return [
    `Hola! Quisiera publicar mi inmobiliaria en ${brand.name}. Te paso mis datos:`,
    "",
    bullets([
      ["Inmobiliaria", d.agencyName],
      ["Zona", d.zone],
      ["Teléfono", d.phone],
      ["Contacto", contact],
      ["Mensaje", d.message],
    ]),
  ].join("\n");
}

/** Aviso de inmobiliaria eliminada — "Contactar con el admin". */
export function providerDeletedMessage(agencyName: string): string {
  return `Hola! Vi que se eliminó mi inmobiliaria "${clean(agencyName)}" en ${brand.name}. Quisiera saber qué pasó.`;
}

/** Botón "Contactar por WhatsApp" de la ficha — mensaje corto con el link de la propiedad. */
export function propertyQuickMessage(d: { title: string; url: string }): string {
  return `Hola! Te escribo por "${d.title}" que vi en ${brand.name}: ${d.url}`;
}

/** Tarjeta "Consultar por esta propiedad" — detallado, con los datos de quien consulta. */
export function inquiryMessage(d: {
  propertyTitle: string;
  propertyUrl: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message: string;
}): string {
  return [
    `Hola! Te escribo por "${d.propertyTitle}" que vi en ${brand.name}:`,
    d.propertyUrl,
    "",
    clean(d.message),
    "",
    bullets([
      ["Nombre", d.name],
      ["Teléfono", d.phone],
      ["Email", d.email],
    ]),
  ].join("\n");
}

/** Link `wa.me` listo para abrir; sin `phone` va al proveedor de la plataforma. */
export function whatsappUrl(message: string, phone?: string): string {
  return buildWhatsappLink(message, phone);
}
