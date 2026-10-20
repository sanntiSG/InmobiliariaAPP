"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils/cn";

/**
 * El texto de la respuesta aparece palabra por palabra (mismo lenguaje que el titular del hero:
 * subida corta + blur-in, `power2.out`). Mientras tanto avisa `onStart`/`onEnd` para que la mascota
 * "hable" justo ese tiempo. Tocar el texto lo completa al instante. Con `fresh = false` (respuestas
 * ya mostradas) o movimiento reducido, el texto está completo desde el primer cuadro.
 */
export function StreamedText({
  text,
  fresh,
  onStart,
  onEnd,
  className,
}: {
  text: string;
  fresh: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  className?: string;
}) {
  const scope = useRef<HTMLParagraphElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  // Se decide al montar: que `fresh` pase a false al terminar no debe reiniciar la animación.
  const startFresh = useRef(fresh);
  const callbacks = useRef({ onStart, onEnd });
  useEffect(() => {
    callbacks.current = { onStart, onEnd };
  });

  const words = text.split(" ");

  useGSAP(
    () => {
      const root = scope.current;
      if (!root || !startFresh.current) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        callbacks.current.onEnd?.();
        return;
      }
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const blur = (px: number) => (coarse ? "blur(0px)" : `blur(${px}px)`);
      const targets = gsap.utils.toArray<HTMLElement>("[data-sw]", root);
      // Tope de ~2,4 s: una respuesta larga no se vuelve eterna.
      const each = Math.min(0.045, 2.2 / Math.max(1, targets.length));
      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        callbacks.current.onEnd?.();
      };

      callbacks.current.onStart?.();
      const tl = gsap.timeline({ defaults: { ease: "power2.out" }, onComplete: finish });
      tl.fromTo(
        targets,
        { opacity: 0, y: 10, filter: blur(6) },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.42, stagger: each, clearProps: coarse ? "transform" : "transform,filter" }
      );
      timeline.current = tl;
      return () => {
        tl.kill();
        finish();
      };
    },
    { scope, dependencies: [text] }
  );

  return (
    <p
      ref={scope}
      className={cn("cursor-default", className)}
      data-streaming={fresh ? "true" : undefined}
      onClick={() => timeline.current?.progress(1)}
    >
      {words.map((w, i) => (
        <span key={i}>
          <span className="advisor-word" data-sw="">
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}
