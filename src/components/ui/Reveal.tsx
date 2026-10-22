"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

/**
 * Un solo IntersectionObserver para todos los bloques de la página (sin ScrollTrigger ni listeners de
 * scroll). Cada bloque se avisa una vez y deja de observarse; los que entran juntos se escalonan.
 */
let observer: IntersectionObserver | null = null;
const handlers = new WeakMap<Element, (stagger: number) => void>();

function observeOnce(el: Element, run: (stagger: number) => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer?.unobserve(entry.target);
        const fn = handlers.get(entry.target);
        handlers.delete(entry.target);
        fn?.(Math.min(i++, 5) * 0.06);
      }
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  handlers.set(el, run);
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    handlers.delete(el);
  };
}

/** `true` si el bloque ya está a la vista (o más arriba) cuando se monta: ahí no se anima, para no parpadear ni retrasar el LCP. */
function alreadySeen(el: Element) {
  return el.getBoundingClientRect().top < window.innerHeight;
}

/**
 * Aparición al hacer scroll para los bloques que están DEBAJO de la primera pantalla: sube 18 px y se
 * funde, una sola vez. Lo que ya se ve al cargar no se toca; con movimiento reducido no hace nada.
 * Sólo transform/opacity.
 */
export function Reveal({
  children,
  className,
  as = "div",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Retraso extra en segundos (para escalonar bloques hermanos que entran juntos). */
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const Tag = as;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || alreadySeen(el)) return;
      gsap.set(el, { opacity: 0, y: 18 });
      const stop = observeOnce(el, (stagger) => {
        gsap.to(el, { opacity: 1, y: 0, duration: 0.6, delay: delay + stagger, ease: "power3.out", clearProps: "opacity,transform" });
      });
      return () => {
        stop();
        gsap.killTweensOf(el);
        gsap.set(el, { clearProps: "opacity,transform" });
      };
    },
    { scope: ref }
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

export { observeOnce, alreadySeen };
