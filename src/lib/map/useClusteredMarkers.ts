"use client";

import { useEffect, useRef, useState } from "react";
import Supercluster from "supercluster";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { PropertyCardData } from "@/components/property/types";

export type PropertyFeature = Supercluster.PointFeature<PropertyCardData>;
export type ClusterFeature = Supercluster.ClusterFeature<PropertyCardData>;
export type RenderedFeature = PropertyFeature | ClusterFeature;

export function isCluster(f: RenderedFeature): f is ClusterFeature {
  return "cluster" in f.properties && f.properties.cluster === true;
}

/**
 * Clustering 100% client-side con Supercluster (la misma librería que usa
 * MapLibre internamente para GeoJSON cluster:true) — se eligió este camino
 * en vez de layers nativos de MapLibre para poder renderizar los pins como
 * componentes React reales (pill de precio, badge 3D) en vez de sprites.
 */
export function useClusteredMarkers(map: MapLibreMap | null, features: PropertyFeature[]) {
  const indexRef = useRef<Supercluster<PropertyCardData> | null>(null);
  const [rendered, setRendered] = useState<RenderedFeature[]>([]);

  useEffect(() => {
    const index = new Supercluster<PropertyCardData>({
      radius: 56,
      maxZoom: 17,
      minPoints: 2,
    });
    index.load(features);
    indexRef.current = index;
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features]);

  function recompute() {
    if (!map || !indexRef.current) return;
    const b = map.getBounds();
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const zoom = Math.round(map.getZoom());
    setRendered(indexRef.current.getClusters(bbox, zoom) as RenderedFeature[]);
  }

  useEffect(() => {
    if (!map) return;
    recompute();
    map.on("moveend", recompute);
    return () => {
      map.off("moveend", recompute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  function getExpansionZoom(clusterId: number): number {
    return indexRef.current?.getClusterExpansionZoom(clusterId) ?? 14;
  }

  return { rendered, getExpansionZoom };
}
