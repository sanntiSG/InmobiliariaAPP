/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";
import type { PostData } from "./content";

/**
 * Templates compatibles con satori (next/og): sólo flexbox y estilos inline.
 * Lienzo fijo de 1080×1350 (4:5). Todos reciben los mismos datos ya armados.
 */
export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1350;

const DISPLAY = "Bricolage";
const SANS = "Manrope";

/** Achica la tipografía del precio según su largo para que nunca desborde. */
function fit(text: string, base: number, maxChars: number): number {
  return text.length <= maxChars ? base : Math.max(40, Math.round((base * maxChars) / text.length));
}

function Price({ d, size, color, suffixColor, maxChars = 10 }: { d: PostData; size: number; color: string; suffixColor?: string; maxChars?: number }) {
  const s = fit(d.price, size, maxChars);
  return (
    <div style={{ display: "flex", alignItems: "baseline" }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: s, lineHeight: 1, color, letterSpacing: -2 }}>
        {d.price}
      </div>
      {d.priceSuffix ? (
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: Math.round(s * 0.34), color: suffixColor ?? color, marginLeft: 10 }}>
          {d.priceSuffix}
        </div>
      ) : null}
    </div>
  );
}

function Specs({ d, size = 30, color, gap = 14 }: { d: PostData; size?: number; color: string; gap?: number }) {
  if (d.specs.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", fontFamily: SANS, fontWeight: 700, fontSize: size, color }}>
      {d.specs.map((s, i) => (
        <div key={s} style={{ display: "flex" }}>
          {i > 0 ? <div style={{ margin: `0 ${gap}px`, opacity: 0.55 }}>·</div> : null}
          {s}
        </div>
      ))}
    </div>
  );
}

function Title({ d, size, color }: { d: PostData; size: number; color: string }) {
  const s = fit(d.title, size, 22);
  return (
    <div style={{ display: "flex", fontFamily: DISPLAY, fontWeight: 800, fontSize: s, lineHeight: 1.05, color, letterSpacing: -1 }}>
      {d.title}
    </div>
  );
}

function Badge({ d, size = 26 }: { d: PostData; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 22px",
        borderRadius: 999,
        background: d.accent,
        color: d.onAccent,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: size,
      }}
    >
      {d.operation}
    </div>
  );
}

function Agency({ d, color, chip = false, onAccent = false }: { d: PostData; color: string; chip?: boolean; onAccent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: chip ? "10px 22px 10px 12px" : 0,
        borderRadius: 999,
        background: chip ? "rgba(255,255,255,0.94)" : "transparent",
      }}
    >
      {d.agencyLogo ? (
        <img src={d.agencyLogo} width={52} height={52} style={{ borderRadius: 999, objectFit: "cover", marginRight: 14 }} alt="" />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: 999,
            background: onAccent ? d.onAccent : d.accent,
            color: onAccent ? d.accent : d.onAccent,
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 28,
            marginRight: 14,
          }}
        >
          {d.agencyName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 28, color: chip ? "#10131a" : color }}>
        {d.agencyName.length > 26 ? `${d.agencyName.slice(0, 25)}…` : d.agencyName}
      </div>
    </div>
  );
}

function Photo({ d, w, h, radius = 0 }: { d: PostData; w: number; h: number; radius?: number }) {
  return <img src={d.photo} width={w} height={h} style={{ width: w, height: h, objectFit: "cover", borderRadius: radius }} alt="" />;
}

/** 0 — Editorial: foto completa, degradado inferior y precio gigante. */
function Editorial(d: PostData) {
  return (
    <div style={{ display: "flex", position: "relative", width: POST_WIDTH, height: POST_HEIGHT, background: "#10131a" }}>
      <Photo d={d} w={POST_WIDTH} h={POST_HEIGHT} />
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: POST_WIDTH,
          height: 820,
          backgroundImage: "linear-gradient(to top, rgba(8,10,16,0.92) 8%, rgba(8,10,16,0))",
        }}
      />
      <div style={{ position: "absolute", top: 56, left: 56, display: "flex" }}>
        <Agency d={d} color="#fff" chip />
      </div>
      <div style={{ position: "absolute", top: 56, right: 56, display: "flex" }}>
        <Badge d={d} />
      </div>
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 72, display: "flex", flexDirection: "column" }}>
        <Title d={d} size={64} color="#fff" />
        <div style={{ display: "flex", marginTop: 22 }}>
          <Price d={d} size={150} color="#fff" />
        </div>
        <div style={{ display: "flex", marginTop: 28 }}>
          <Specs d={d} size={32} color="rgba(255,255,255,0.92)" />
        </div>
      </div>
    </div>
  );
}

/** 1 — Split: foto arriba, panel claro abajo. */
function Split(d: PostData) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: POST_WIDTH, height: POST_HEIGHT, background: "#ffffff" }}>
      <div style={{ display: "flex", position: "relative", width: POST_WIDTH, height: 800 }}>
        <Photo d={d} w={POST_WIDTH} h={800} />
        <div style={{ position: "absolute", top: 48, left: 48, display: "flex" }}>
          <Badge d={d} size={28} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "52px 64px 48px", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Title d={d} size={58} color="#10131a" />
          <div style={{ display: "flex", marginTop: 20 }}>
            <Price d={d} size={112} color={d.accent} />
          </div>
          <div style={{ display: "flex", marginTop: 22 }}>
            <Specs d={d} size={30} color="#4b5262" />
          </div>
        </div>
        <Agency d={d} color="#10131a" />
      </div>
    </div>
  );
}

/** 2 — Marco: foto con paspartú y el texto al pie. */
function Frame(d: PostData) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: POST_WIDTH, height: POST_HEIGHT, background: "#f3efe7", padding: 56 }}>
      <div style={{ display: "flex", position: "relative", width: 968, height: 820 }}>
        <Photo d={d} w={968} h={820} radius={32} />
        <div style={{ position: "absolute", top: 28, left: 28, display: "flex" }}>
          <Badge d={d} size={26} />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between", paddingTop: 36 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Title d={d} size={56} color="#10131a" />
          <div style={{ display: "flex", marginTop: 16 }}>
            <Price d={d} size={100} color="#10131a" suffixColor="#4b5262" />
          </div>
          <div style={{ display: "flex", marginTop: 18 }}>
            <Specs d={d} size={29} color="#4b5262" />
          </div>
        </div>
        <Agency d={d} color="#10131a" />
      </div>
    </div>
  );
}

/** 3 — Columna: banda de color con los datos y la foto al costado. */
function Column(d: PostData) {
  const t = d.onAccent;
  return (
    <div style={{ display: "flex", width: POST_WIDTH, height: POST_HEIGHT, background: d.accent }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 500, height: POST_HEIGHT, padding: "64px 44px 56px 56px" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "10px 22px",
              borderRadius: 999,
              border: `3px solid ${t}`,
              color: t,
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 26,
            }}
          >
            {d.operation}
          </div>
          <div style={{ display: "flex", marginTop: 44 }}>
            <Title d={d} size={72} color={t} />
          </div>
          {d.location ? (
            <div style={{ display: "flex", marginTop: 18, fontFamily: SANS, fontWeight: 500, fontSize: 28, color: t, opacity: 0.85 }}>
              {d.location}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", marginBottom: 26 }}>
            <Price d={d} size={74} color={t} maxChars={8} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: SANS, fontWeight: 700, fontSize: 30, color: t }}>
            {d.specs.map((s) => (
              <div key={s} style={{ display: "flex", marginTop: 6 }}>
                {s}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 40 }}>
            <Agency d={d} color={t} onAccent />
          </div>
        </div>
      </div>
      <Photo d={d} w={580} h={POST_HEIGHT} />
    </div>
  );
}

/** 4 — Tarjeta flotante: foto completa y una card blanca abajo a la izquierda. */
function FloatingCard(d: PostData) {
  return (
    <div style={{ display: "flex", position: "relative", width: POST_WIDTH, height: POST_HEIGHT, background: "#10131a" }}>
      <Photo d={d} w={POST_WIDTH} h={POST_HEIGHT} />
      <div style={{ position: "absolute", top: 56, left: 56, display: "flex" }}>
        <Agency d={d} color="#fff" chip />
      </div>
      <div
        style={{
          position: "absolute",
          left: 48,
          bottom: 48,
          width: 700,
          display: "flex",
          flexDirection: "column",
          padding: "44px 48px",
          borderRadius: 40,
          background: "#ffffff",
        }}
      >
        <div style={{ display: "flex" }}>
          <Badge d={d} size={24} />
        </div>
        <div style={{ display: "flex", marginTop: 22 }}>
          <Title d={d} size={50} color="#10131a" />
        </div>
        <div style={{ display: "flex", marginTop: 14 }}>
          <Price d={d} size={96} color={d.accent} />
        </div>
        <div style={{ display: "flex", marginTop: 20 }}>
          <Specs d={d} size={26} color="#4b5262" gap={10} />
        </div>
      </div>
    </div>
  );
}

/** 5 — Nocturno: fondo oscuro, foto redondeada y tipografía protagonista. */
function Night(d: PostData) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: POST_WIDTH, height: POST_HEIGHT, background: "#0e1118", padding: 56 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Agency d={d} color="#ffffff" />
        <Badge d={d} size={26} />
      </div>
      <div style={{ display: "flex", marginTop: 32 }}>
        <Photo d={d} w={968} h={830} radius={44} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
        <Title d={d} size={56} color="#ffffff" />
        <div style={{ display: "flex", marginTop: 16 }}>
          <Price d={d} size={104} color="#ffffff" suffixColor="#aab2c5" />
        </div>
        <div style={{ display: "flex", marginTop: 22 }}>
          <Specs d={d} size={30} color="#aab2c5" />
        </div>
      </div>
    </div>
  );
}

export const TEMPLATES: ((d: PostData) => ReactElement)[] = [Editorial, Split, Frame, Column, FloatingCard, Night];
export const TEMPLATE_COUNT = TEMPLATES.length;
