"use client";

import { usePropertyTracking } from "@/lib/tracking/client";

/** No renderiza nada: registra la vista y la permanencia de la ficha (ver `usePropertyTracking`). */
export function PropertyTracker({ propertyId, enabled }: { propertyId: string; enabled: boolean }) {
  usePropertyTracking(propertyId, enabled);
  return null;
}
