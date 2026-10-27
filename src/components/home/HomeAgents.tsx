"use client";

import { useRef } from "react";
import { Check, Users } from "lucide-react";
import { AGENT_ICONS } from "@/components/agents/agent-icons";
import { openAgent, useAdvisorState } from "@/components/advisor/store";
import { buttonClasses } from "@/components/ui/Button";
import { AGENTS_SECTION } from "@/config/home-sections";
import { HOME_AUDIENCE_LABELS, type HomeAgentCard } from "@/lib/agents/home";
import type { AgentId } from "@/lib/agents/registry";

/** Una mini-escena dibujada en CSS de lo que hace cada agente (decorativa: no es información de nadie). */
function Scene({ id }: { id: AgentId }) {
  const s = AGENTS_SECTION.scenes;
  if (id === "advisor") {
    return (
      <div className="home-art agent-scene" aria-hidden="true">
        <span className="agent-bubble agent-bubble-q" data-part="">
          {s.advisor.question}
        </span>
        <span className="agent-bubble agent-bubble-a" data-part="">
          {s.advisor.answer.map((line, i) => (
            <span key={line} className="agent-line">
              <i className="agent-line-bar" style={{ width: `${[78, 62, 46][i] ?? 40}%` }} />
              {line}
            </span>
          ))}
        </span>
      </div>
    );
  }
  if (id === "marketing") {
    return (
      <div className="home-art agent-scene agent-scene-post" aria-hidden="true">
        <span className="agent-post-photo" data-part="">
          <span className="agent-post-sun" />
          <span className="agent-post-roof" />
        </span>
        <span className="agent-post-side">
          <span className="hero-chip" data-part="">
            <Check aria-hidden /> {s.marketing.chip}
          </span>
          <span className="agent-tags">
            {s.marketing.tags.map((t) => (
              <span key={t} className="agent-tag" data-part="">
                {t}
              </span>
            ))}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="home-art agent-scene" aria-hidden="true">
      {s.mail.rows.map((row) => (
        <span key={row.text} className="agent-mail" data-part="">
          <i className={row.done ? "agent-dot agent-dot-done" : "agent-dot"} />
          <span className="agent-mail-text">{row.text}</span>
          <span className={row.done ? "hero-chip" : "hero-chip home-chip-quiet"}>{row.state}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * La sección de agentes de la portada: una tarjeta liviana por agente con su nombre (el que definió el admin, nunca uno fijo en
 * el código), qué hace en una línea, una mini-escena y para quién está disponible. Si quien mira puede usar ese agente, la
 * tarjeta ofrece abrirlo ahí mismo. Las animaciones de entrada las maneja `HomeSections` (mismo lenguaje que el resto de la portada).
 */
export function HomeAgents({ agents }: { agents: HomeAgentCard[] }) {
  const { agents: mine } = useAdvisorState();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (agents.length === 0) return null;

  return (
    <section className="home-section" aria-labelledby="home-agents-title">
      <p className="hero-eyebrow home-eyebrow" data-reveal="">
        <span className="hero-eyebrow-dot" aria-hidden="true" />
        {AGENTS_SECTION.eyebrow}
      </p>
      <h2 id="home-agents-title" className="home-title" data-scrub-title="" aria-label={AGENTS_SECTION.title}>
        <AgentsTitle />
      </h2>
      <p className="home-agents-lead" data-reveal="">
        {AGENTS_SECTION.lead}
      </p>

      <div className="home-agent-grid" data-agents={agents.length}>
        {agents.map((agent) => {
          const Icon = AGENT_ICONS[agent.id];
          // Si quien mira puede usar este agente (el servidor ya filtró por rol), se ofrece abrirlo desde la tarjeta.
          const usable = mine.some((a) => a.id === agent.id);
          return (
            <article key={agent.id} className="home-card home-agent" data-agent="">
              <header className="home-agent-head">
                <span className="home-agent-avatar" aria-hidden="true">
                  {agent.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element -- póster chico y propio; no necesita el optimizador
                    <img src={agent.poster} alt="" draggable={false} />
                  ) : (
                    <Icon />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="home-agent-name">{agent.name}</h3>
                  <p className="home-agent-role">{agent.role}</p>
                </div>
              </header>
              <p className="home-agent-text">{agent.tagline}</p>
              <Scene id={agent.id} />
              <footer className="home-agent-foot">
                <span className="hero-chip">
                  <Users aria-hidden /> {HOME_AUDIENCE_LABELS[agent.audience]}
                </span>
                {usable && (
                  <button
                    type="button"
                    ref={(el) => {
                      refs.current[agent.id] = el;
                    }}
                    className={buttonClasses("secondary", "sm")}
                    aria-label={`Abrir a ${agent.name}`}
                    onClick={() => openAgent(agent.id, { origin: refs.current[agent.id]?.getBoundingClientRect() ?? null })}
                  >
                    Probalo
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** El título con las letras separadas, igual que los otros títulos de la portada (las anima `HomeSections`). */
function AgentsTitle() {
  const words = AGENTS_SECTION.title.split(" ");
  return words.map((word, i) => (
    <span key={i}>
      <span className="hero-word" aria-hidden="true">
        {[...word].map((ch, j) => (
          <span key={j} className="hero-char" data-scrub-char="">
            {ch}
          </span>
        ))}
      </span>
      {i < words.length - 1 ? " " : null}
    </span>
  ));
}
