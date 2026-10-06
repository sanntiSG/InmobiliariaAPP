"use client";

import type { AnchorHTMLAttributes } from "react";
import { track, type TrackPayload } from "@/lib/tracking/client";

/** `<a>` que registra un evento de contacto (WhatsApp / llamada / email) al hacer clic. */
export function TrackedContactLink({
  propertyId,
  channel,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  propertyId: string;
  channel: NonNullable<TrackPayload["channel"]>;
}) {
  return (
    <a
      {...props}
      onClick={(e) => {
        track({ propertyId, event: "contact", channel });
        onClick?.(e);
      }}
    />
  );
}
