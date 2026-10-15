import { HERO_ZONES } from "@/config/hero";

/** Cinta infinita de zonas. CSS puro: dos copias de la lista, la segunda oculta a lectores de pantalla. */
export function HeroMarquee() {
  return (
    <div className="hero-marquee" role="group" aria-label="Zonas con propiedades">
      <p className="hero-marquee-label">Explorá por zona</p>
      <div className="hero-marquee-track">
        {[0, 1].map((copy) => (
          <ul key={copy} className="hero-marquee-list" aria-hidden={copy === 1 ? true : undefined}>
            {HERO_ZONES.map((zone) => (
              <li key={zone}>{zone}</li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
