"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { PublicAdvisorConfig } from "@/lib/advisor/public-config";
import { AdvisorLauncher } from "./AdvisorLauncher";
import { configure, setAgencyId, useAdvisorState, type Account } from "./store";

// El escenario (GSAP + three.js) sólo se descarga cuando alguien lo abre o se acerca al botón.
const loadStage = () => import("./AdvisorStage");
const AdvisorStage = dynamic(loadStage, { ssr: false });

/**
 * Se monta una vez en el layout raíz. Le da al store la configuración publicada y la cuenta (con el
 * rol ya confirmado contra la base) y aloja el lanzador y el escenario. Nada de esto toca el HTML de
 * las páginas: el asesor es una capa flotante.
 */
export function AdvisorProvider({
  config,
  agents,
  account,
  children,
}: {
  config: PublicAdvisorConfig;
  agents: PublicAdvisorConfig[];
  account: Account;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { open } = useAdvisorState();
  const [wanted, setWanted] = useState(false);
  const warmed = useRef(false);

  useEffect(() => {
    configure(config, agents, account);
  }, [config, agents, account]);

  // El admin trabaja sobre una inmobiliaria elegida con `?agencyId=` en el panel.
  useEffect(() => {
    const fromUrl = pathname.startsWith("/dashboard") ? new URLSearchParams(window.location.search).get("agencyId") : null;
    setAgencyId(account.role === "admin" && fromUrl && /^[a-f0-9]{24}$/i.test(fromUrl) ? fromUrl : null);
  }, [pathname, account.role]);

  const modelUrl = config.modelUrl;
  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    void loadStage();
    // Además del escenario, el modelo 3D: así, al abrirlo, ya está descargado (antes empezaba a bajar recién ahí).
    void import("./mascot/scene").then((m) => m.preloadMascot(modelUrl));
    setWanted(true);
  }, [modelUrl]);

  // Con tiempo libre tras cargar la página se adelanta el modelo, salvo con ahorro de datos o conexión lenta: abrir un agente es
  // lo más probable que haga quien ve el botón, y así no se espera. Tarda unos segundos para no competir con lo que se está viendo.
  const hasAgents = agents.length > 0;
  useEffect(() => {
    if (!hasAgents) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /^(slow-2g|2g|3g)$/.test(conn?.effectiveType ?? "")) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) void import("./mascot/scene").then((m) => m.preloadMascot(modelUrl));
    };
    // Safari no tiene requestIdleCallback: ahí se usa un temporizador.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const id = hasIdle ? window.requestIdleCallback(run, { timeout: 9000 }) : window.setTimeout(run, 4000);
    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, [hasAgents, modelUrl]);

  useEffect(() => {
    if (open) warm();
  }, [open, warm]);

  return (
    <>
      {children}
      <AdvisorLauncher onWarm={warm} />
      {(wanted || open) && <AdvisorStage />}
    </>
  );
}
