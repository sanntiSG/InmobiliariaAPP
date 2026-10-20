"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { PublicAdvisorConfig } from "@/lib/advisor/config";
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
export function AdvisorProvider({ config, account, children }: { config: PublicAdvisorConfig; account: Account; children: ReactNode }) {
  const pathname = usePathname();
  const { open } = useAdvisorState();
  const [wanted, setWanted] = useState(false);
  const warmed = useRef(false);

  useEffect(() => {
    configure(config, account);
  }, [config, account]);

  // El admin trabaja sobre una inmobiliaria elegida con `?agencyId=` en el panel.
  useEffect(() => {
    const fromUrl = pathname.startsWith("/dashboard") ? new URLSearchParams(window.location.search).get("agencyId") : null;
    setAgencyId(account.role === "admin" && fromUrl && /^[a-f0-9]{24}$/i.test(fromUrl) ? fromUrl : null);
  }, [pathname, account.role]);

  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    void loadStage();
    setWanted(true);
  }, []);

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
