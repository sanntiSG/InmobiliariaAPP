"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { AdvisorAnswer } from "@/lib/advisor/types";
import { BlockView } from "./blocks";
import { StreamedText } from "./StreamedText";

/**
 * Una respuesta del asesor: el texto principal (grande y animado si es la última, chico si es
 * historial), después los bloques con datos y, al final, los accesos directos. Los bloques entran
 * recién cuando termina de aparecer el texto, con el mismo reveal escalonado del resto del sitio.
 */
export function AnswerView({
  answer,
  fresh,
  latest,
  onTalkStart,
  onTalkEnd,
  onOpenProperty,
}: {
  answer: AdvisorAnswer;
  fresh: boolean;
  /** La última respuesta es la protagonista; las anteriores quedan como historial. */
  latest: boolean;
  onTalkStart: (mood: AdvisorAnswer["mood"]) => void;
  onTalkEnd: () => void;
  onOpenProperty: (slug: string) => void;
}) {
  // Sólo las respuestas recién llegadas esperan al texto; el historial se muestra completo.
  const [leadDone, setLeadDone] = useState(!(fresh && latest));
  const blocks = useRef<HTMLDivElement>(null);
  const animateBlocks = useRef(fresh && latest);

  useGSAP(
    () => {
      const root = blocks.current;
      if (!root || !leadDone || !animateBlocks.current) return;
      animateBlocks.current = false;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      gsap.fromTo(
        root.querySelectorAll(":scope > [data-advisor-block]"),
        { opacity: 0, y: 16, filter: coarse ? "blur(0px)" : "blur(6px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: "power2.out", stagger: 0.07, clearProps: coarse ? "transform" : "transform,filter" }
      );
    },
    { scope: blocks, dependencies: [leadDone] }
  );

  return (
    <article className="flex flex-col gap-4" data-latest={latest ? "true" : undefined}>
      {fresh && latest && (
        <span className="sr-only" role="status">
          {answer.lead}
        </span>
      )}
      <div aria-hidden={fresh && latest ? true : undefined}>
        <StreamedText
          text={answer.lead}
          fresh={fresh && latest}
          onStart={() => onTalkStart(answer.mood)}
          onEnd={() => {
            setLeadDone(true);
            onTalkEnd();
          }}
          className={latest ? "advisor-lead" : "advisor-lead advisor-lead-past"}
        />
      </div>

      {answer.blocks.length > 0 && (
        <div ref={blocks} className="flex flex-col gap-3">
          {answer.blocks.map((block, i) => (
            <div key={i} data-advisor-block="" className={cn(!leadDone && "invisible")}>
              <BlockView block={block} onOpenProperty={onOpenProperty} />
            </div>
          ))}
        </div>
      )}

      {latest && answer.actions.length > 0 && (
        <div className={cn("flex flex-wrap gap-2", !leadDone && "invisible")}>
          {answer.actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className={buttonClasses(a.kind === "primary" ? "primary" : "secondary", "sm")}>
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
