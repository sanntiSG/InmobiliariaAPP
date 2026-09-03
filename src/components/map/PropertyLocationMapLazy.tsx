"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * `dynamic(..., { ssr: false })` solo se puede llamar desde un Client
 * Component — este wrapper existe para poder usarlo desde la página de
 * detalle, que es un Server Component (async, con generateMetadata).
 */
export const PropertyLocationMapLazy = dynamic(
  () => import("./PropertyLocationMap").then((m) => m.PropertyLocationMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-card" /> }
);
