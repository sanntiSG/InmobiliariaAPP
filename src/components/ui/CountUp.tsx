"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { formatMetric, type MetricFormat } from "@/lib/utils/metric-format";
import { alreadySeen, observeOnce } from "./Reveal";

/**
 * Número que cuenta desde 0 hasta su valor la primera vez que se ve (0,9 s, power2.out). El servidor
 * ya manda el valor final: sin JS o con movimiento reducido se ve tal cual. Escribe directo en el nodo
 * de texto (sin re-renderizar React por cuadro) y usa cifras tabulares sólo mientras cuenta, para que
 * el ancho no salte.
 */
export function CountUp({ value, format = "int", className }: { value: number; format?: MetricFormat; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      const text = el?.firstChild;
      if (!el || !(text instanceof Text) || value <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const proxy = { n: 0 };
      const play = () => {
        el.style.fontVariantNumeric = "tabular-nums";
        gsap.to(proxy, {
          n: value,
          duration: 0.9,
          ease: "power2.out",
          onUpdate: () => {
            text.nodeValue = formatMetric(format, Math.round(proxy.n));
          },
          onComplete: () => {
            text.nodeValue = formatMetric(format, value);
            el.style.fontVariantNumeric = "";
          },
        });
      };

      let stop: (() => void) | undefined;
      text.nodeValue = formatMetric(format, 0);
      if (alreadySeen(el)) play();
      else stop = observeOnce(el, play);

      return () => {
        stop?.();
        gsap.killTweensOf(proxy);
        el.style.fontVariantNumeric = "";
        text.nodeValue = formatMetric(format, value);
      };
    },
    { scope: ref, dependencies: [value, format] }
  );

  return (
    <span ref={ref} className={className}>
      {formatMetric(format, value)}
    </span>
  );
}
