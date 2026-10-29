import type { ReactNode } from "react";
import type { GuideScene } from "@/lib/push/guide";

/**
 * Las ilustraciones de la guía para activar los avisos: un iPhone, un Android o una computadora dibujados en SVG, con los colores
 * del tema (claro y oscuro) y SIN fotos ni capturas de terceros. Cada escena marca con `data-ring` el lugar exacto que hay que tocar
 * (la guía le superpone un anillo animado) y con `data-sheet` lo que se desliza desde abajo. El nombre de la plataforma llega como
 * dato (`appName`): acá no está escrito.
 */

const PHONE = { w: 200, h: 340 };
const WIDE = { w: 320, h: 210 };

export const sceneBox = (scene: GuideScene): { w: number; h: number } => (scene.startsWith("desktop") ? WIDE : PHONE);

const short = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

// ─── Piezas ──────────────────────────────────────────────────────────────────────────────────────

/** El lugar a tocar: un punto con un anillo (el anillo lo anima la guía). */
function Tap({ x, y }: { x: number; y: number }) {
  return (
    <g data-ring transform={`translate(${x} ${y})`}>
      <circle className="guide-ring fill-accent/25 stroke-accent" r="15" strokeWidth="2" />
      <circle className="fill-accent" r="4" />
    </g>
  );
}

/** Un marco que resalta lo que hay que mirar. */
function Highlight({ x, y, w, h, r = 10 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return <rect data-hl x={x} y={y} width={w} height={h} rx={r} className="fill-none stroke-accent" strokeWidth="2.5" />;
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <>
      <defs>
        <clipPath id="guide-phone-screen">
          <rect x="10" y="10" width="180" height="320" rx="22" />
        </clipPath>
      </defs>
      <rect x="2" y="2" width="196" height="336" rx="30" className="fill-surface stroke-border-hi" strokeWidth="3" />
      <rect x="10" y="10" width="180" height="320" rx="22" className="fill-surface-sunken" />
      <g clipPath="url(#guide-phone-screen)">{children}</g>
      <rect x="74" y="16" width="52" height="13" rx="6.5" className="fill-text" />
    </>
  );
}

/** Una página web de ejemplo (encabezado, imagen y renglones). */
function PageMock({ appName }: { appName: string }) {
  return (
    <g>
      <rect x="10" y="10" width="180" height="42" className="fill-surface" />
      <circle cx="26" cy="38" r="5" className="fill-accent" />
      <text x="36" y="41" fontSize="9" fontWeight="700" className="fill-text">
        {short(appName, 14)}
      </text>
      <rect x="22" y="62" width="156" height="92" rx="10" className="fill-accent-soft" />
      <rect x="22" y="166" width="104" height="8" rx="4" className="fill-text-muted/40" />
      <rect x="22" y="182" width="140" height="6" rx="3" className="fill-text-muted/25" />
      <rect x="22" y="194" width="120" height="6" rx="3" className="fill-text-muted/25" />
      <rect x="22" y="214" width="156" height="50" rx="10" className="fill-surface-2" />
    </g>
  );
}

/** La barra de Safari de abajo (como en el iPhone): la dirección y, a la derecha, Compartir. */
function SafariBar({ appName, share = false }: { appName: string; share?: boolean }) {
  return (
    <g>
      <rect x="10" y="282" width="180" height="48" className="fill-surface" />
      <rect x="18" y="290" width="164" height="30" rx="15" className="fill-surface-2" />
      <text x="100" y="309" fontSize="9" textAnchor="middle" className="fill-text-muted">
        {short(appName.toLowerCase().replace(/\s+/g, ""), 14)}
      </text>
      {/* Compartir: un cuadrado abierto con una flecha hacia arriba */}
      <g transform="translate(165 305)" className={share ? "stroke-accent" : "stroke-text-muted"} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 -7 V3 M-3.5 -3.5 L0 -7 L3.5 -3.5 M-6 0 V7 H6 V0" />
      </g>
    </g>
  );
}

function AppIcon({ x, y, size = 34, appName, className = "fill-accent" }: { x: number; y: number; size?: number; appName: string; className?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.24} className={className} />
      <text x={x + size / 2} y={y + size * 0.67} fontSize={size * 0.5} fontWeight="700" textAnchor="middle" className="fill-accent-contrast">
        {appName.trim().charAt(0).toUpperCase()}
      </text>
    </g>
  );
}

/** Un botón de un cuadro de diálogo. */
function Btn({ x, y, w, h, label, primary = false }: { x: number; y: number; w: number; h: number; label: string; primary?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2.4} className={primary ? "fill-accent" : "fill-surface-3"} />
      <text x={x + w / 2} y={y + h / 2 + 3.2} fontSize="9" fontWeight="600" textAnchor="middle" className={primary ? "fill-accent-contrast" : "fill-text"}>
        {label}
      </text>
    </g>
  );
}

function Toggle({ x, y, on = true }: { x: number; y: number; on?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width="30" height="18" rx="9" className={on ? "fill-accent" : "fill-surface-3"} />
      <circle cx={on ? x + 21 : x + 9} cy={y + 9} r="7" className="fill-white" />
    </g>
  );
}

function Dim() {
  return <rect x="10" y="10" width="180" height="320" className="fill-text/30" />;
}

// ─── Escenas del iPhone ─────────────────────────────────────────────────────────────────────────

function IosSafari({ appName }: { appName: string }) {
  return (
    <Phone>
      <PageMock appName={appName} />
      <SafariBar appName={appName} />
      <g>
        <rect x="68" y="248" width="64" height="22" rx="11" className="fill-accent" />
        <text x="100" y="263" fontSize="10" fontWeight="700" textAnchor="middle" className="fill-accent-contrast">
          Safari
        </text>
      </g>
      <Highlight x={16} y={288} w={168} h={34} r={17} />
    </Phone>
  );
}

function IosShare({ appName }: { appName: string }) {
  return (
    <Phone>
      <PageMock appName={appName} />
      <SafariBar appName={appName} share />
      <Highlight x={150} y={291} w={30} h={28} r={9} />
      <Tap x={165} y={305} />
    </Phone>
  );
}

function IosAdd({ appName }: { appName: string }) {
  const rows = ["Copiar", "Agregar a marcadores", "Agregar a inicio", "Buscar en la página"];
  return (
    <Phone>
      <PageMock appName={appName} />
      <Dim />
      <g data-sheet>
        <rect x="10" y="120" width="180" height="214" rx="22" className="fill-surface" />
        <rect x="88" y="128" width="24" height="4" rx="2" className="fill-text-muted/40" />
        <AppIcon x={22} y={142} size={30} appName={appName} />
        <text x="60" y="155" fontSize="9" fontWeight="700" className="fill-text">
          {short(appName, 18)}
        </text>
        <text x="60" y="167" fontSize="7.5" className="fill-text-muted">
          {short(appName.toLowerCase().replace(/\s+/g, ""), 20)}
        </text>
        {rows.map((label, i) => {
          const y = 184 + i * 34;
          const target = i === 2;
          return (
            <g key={label}>
              <rect x="18" y={y} width="164" height="30" rx="9" className={target ? "fill-accent-soft" : "fill-surface-2"} />
              <text x="30" y={y + 19} fontSize="9" fontWeight={target ? 700 : 500} className="fill-text">
                {label}
              </text>
              {target ? (
                <g transform={`translate(164 ${y + 15})`} className="stroke-text" fill="none" strokeWidth="1.6" strokeLinecap="round">
                  <rect x="-7" y="-7" width="14" height="14" rx="3" />
                  <path d="M0 -3 V3 M-3 0 H3" />
                </g>
              ) : (
                <circle cx="164" cy={y + 15} r="4" className="fill-text-muted/30" />
              )}
            </g>
          );
        })}
        {/* La fila «Agregar a inicio» es la tercera: empieza en y = 184 + 2 × 34 */}
        <Highlight x={16} y={250} w={168} h={34} r={11} />
        <Tap x={140} y={267} />
      </g>
    </Phone>
  );
}

function IosHome({ appName }: { appName: string }) {
  const tones = ["fill-surface-3", "fill-accent-soft", "fill-surface-3", "fill-surface-3", "fill-accent-soft", "fill-surface-3", "fill-surface-3", "fill-surface-3"];
  return (
    <Phone>
      <rect x="10" y="10" width="180" height="320" className="fill-surface-2" />
      {tones.map((tone, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return <rect key={i} x={24 + col * 40} y={60 + row * 62} width="30" height="30" rx="8" className={tone} />;
      })}
      {/* El ícono nuevo, en el primer lugar libre de la tercera fila */}
      <AppIcon x={24} y={184} size={30} appName={appName} />
      <text x="39" y="229" fontSize="7.5" textAnchor="middle" fontWeight="600" className="fill-text">
        {short(appName, 9)}
      </text>
      <Highlight x={18} y={178} w={42} h={56} r={11} />
      <Tap x={53} y={210} />
      <rect x="22" y="282" width="156" height="38" rx="16" className="fill-surface/70" />
    </Phone>
  );
}

// ─── Cuadros de permiso ─────────────────────────────────────────────────────────────────────────

function IosAllow({ appName }: { appName: string }) {
  const name = short(appName, 12);
  return (
    <Phone>
      <PageMock appName={appName} />
      <Dim />
      <rect x="28" y="108" width="144" height="124" rx="16" className="fill-surface" />
      <text x="100" y="134" fontSize="9.5" fontWeight="700" textAnchor="middle" className="fill-text">
        «{name}» quiere
      </text>
      <text x="100" y="147" fontSize="9.5" fontWeight="700" textAnchor="middle" className="fill-text">
        enviarte avisos
      </text>
      <text x="100" y="164" fontSize="7.5" textAnchor="middle" className="fill-text-muted">
        Pueden incluir alertas y sonidos.
      </text>
      <Btn x={38} y={182} w={60} h={32} label="No permitir" />
      <Btn x={102} y={182} w={60} h={32} label="Permitir" primary />
      <Highlight x={99} y={179} w={66} h={38} r={14} />
      <Tap x={152} y={206} />
    </Phone>
  );
}

function AndroidAllow({ appName }: { appName: string }) {
  const name = short(appName, 16);
  return (
    <Phone>
      <PageMock appName={appName} />
      <Dim />
      <rect x="10" y="168" width="180" height="162" rx="22" className="fill-surface" />
      <text x="100" y="196" fontSize="9.5" fontWeight="700" textAnchor="middle" className="fill-text">
        ¿Permitir que {name}
      </text>
      <text x="100" y="209" fontSize="9.5" fontWeight="700" textAnchor="middle" className="fill-text">
        te envíe notificaciones?
      </text>
      <Btn x={24} y={228} w={152} h={34} label="Permitir" primary />
      <Btn x={24} y={270} w={152} h={34} label="No permitir" />
      <Highlight x={20} y={225} w={160} h={40} r={16} />
      <Tap x={158} y={252} />
    </Phone>
  );
}

function DesktopWindow({ appName, children }: { appName: string; children: ReactNode }) {
  return (
    <>
      <rect x="2" y="2" width="316" height="206" rx="12" className="fill-surface stroke-border-hi" strokeWidth="3" />
      <rect x="2" y="2" width="316" height="38" rx="12" className="fill-surface-2" />
      <rect x="2" y="26" width="316" height="14" className="fill-surface-2" />
      <circle cx="18" cy="21" r="3.5" className="fill-text-muted/50" />
      <circle cx="30" cy="21" r="3.5" className="fill-text-muted/50" />
      <circle cx="42" cy="21" r="3.5" className="fill-text-muted/50" />
      <rect x="60" y="11" width="236" height="20" rx="10" className="fill-surface" />
      <text x="92" y="25" fontSize="8.5" className="fill-text-muted">
        {short(appName.toLowerCase().replace(/\s+/g, ""), 28)}
      </text>
      <rect x="14" y="52" width="292" height="144" rx="8" className="fill-surface-sunken" />
      <rect x="26" y="64" width="150" height="62" rx="8" className="fill-accent-soft" />
      <rect x="26" y="138" width="110" height="8" rx="4" className="fill-text-muted/40" />
      <rect x="26" y="154" width="170" height="6" rx="3" className="fill-text-muted/25" />
      {children}
    </>
  );
}

function DesktopAllow({ appName }: { appName: string }) {
  return (
    <DesktopWindow appName={appName}>
      <g>
        <rect x="64" y="36" width="170" height="92" rx="10" className="fill-surface stroke-border-hi" strokeWidth="1.5" />
        <text x="76" y="56" fontSize="8.5" fontWeight="700" className="fill-text">
          {short(appName.toLowerCase().replace(/\s+/g, ""), 22)} quiere
        </text>
        <text x="76" y="70" fontSize="8" className="fill-text-muted">
          Enviarte notificaciones
        </text>
        <Btn x={74} y={86} w={72} h={26} label="Permitir" primary />
        <Btn x={152} y={86} w={72} h={26} label="Bloquear" />
        <Highlight x={70} y={83} w={80} h={32} r={12} />
        <Tap x={137} y={106} />
      </g>
    </DesktopWindow>
  );
}

// ─── Desbloquear avisos que se bloquearon ───────────────────────────────────────────────────────

function IosUnblock({ appName }: { appName: string }) {
  return (
    <Phone>
      <rect x="10" y="10" width="180" height="320" className="fill-surface-2" />
      <text x="100" y="62" fontSize="11" fontWeight="700" textAnchor="middle" className="fill-text">
        Notificaciones
      </text>
      <rect x="18" y="82" width="164" height="46" rx="12" className="fill-surface" />
      <AppIcon x={26} y={90} size={30} appName={appName} />
      <text x="64" y="110" fontSize="9" fontWeight="600" className="fill-text">
        {short(appName, 14)}
      </text>
      <rect x="18" y="140" width="164" height="42" rx="12" className="fill-surface" />
      <text x="28" y="165" fontSize="9" fontWeight="500" className="fill-text">
        Permitir notificaciones
      </text>
      <Toggle x={146} y={152} />
      <Highlight x={14} y={136} w={172} h={50} r={14} />
      <Tap x={161} y={161} />
    </Phone>
  );
}

function AndroidUnblock({ appName }: { appName: string }) {
  return (
    <Phone>
      <rect x="10" y="10" width="180" height="48" className="fill-surface" />
      <rect x="18" y="26" width="164" height="26" rx="13" className="fill-surface-2" />
      <g transform="translate(32 39)" className="stroke-text" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="-5" y="-1" width="10" height="8" rx="1.5" />
        <path d="M-3 -1 V-4 A3 3 0 0 1 3 -4 V-1" />
      </g>
      <text x="46" y="42" fontSize="8.5" className="fill-text-muted">
        {short(appName.toLowerCase().replace(/\s+/g, ""), 20)}
      </text>
      <Highlight x={22} y={28} w={22} h={22} r={11} />
      <Tap x={33} y={39} />
      <rect x="22" y="66" width="156" height="92" rx="14" className="fill-surface stroke-border-hi" strokeWidth="1.5" />
      <text x="34" y="88" fontSize="9" fontWeight="700" className="fill-text">
        Permisos del sitio
      </text>
      <text x="34" y="114" fontSize="9" className="fill-text">
        Notificaciones
      </text>
      <Toggle x={132} y={102} />
      <rect x="22" y="180" width="156" height="8" rx="4" className="fill-text-muted/25" />
    </Phone>
  );
}

function DesktopUnblock({ appName }: { appName: string }) {
  return (
    <DesktopWindow appName={appName}>
      <g transform="translate(74 21)" className="stroke-text" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="-4.5" y="-1" width="9" height="7" rx="1.5" />
        <path d="M-2.5 -1 V-3.5 A2.5 2.5 0 0 1 2.5 -3.5 V-1" />
      </g>
      <Highlight x={64} y={11} w={20} h={20} r={10} />
      <Tap x={74} y={21} />
      <rect x="60" y="40" width="190" height="84" rx="10" className="fill-surface stroke-border-hi" strokeWidth="1.5" />
      <text x="72" y="60" fontSize="8.5" fontWeight="700" className="fill-text">
        Configuración del sitio
      </text>
      <text x="72" y="84" fontSize="8.5" className="fill-text">
        Notificaciones
      </text>
      <Toggle x={206} y={72} />
      <text x="72" y="108" fontSize="7.5" className="fill-text-muted">
        Después, volvé a cargar la página.
      </text>
    </DesktopWindow>
  );
}

// ─── Lo que se exporta ──────────────────────────────────────────────────────────────────────────

/** La ilustración de una escena, lista para ponerla en la pantalla (el texto del paso va aparte, en la guía). */
export function SceneArt({ scene, appName, className }: { scene: GuideScene; appName: string; className?: string }) {
  const { w, h } = sceneBox(scene);
  const art: Record<GuideScene, ReactNode> = {
    "ios-safari": <IosSafari appName={appName} />,
    "ios-share": <IosShare appName={appName} />,
    "ios-add": <IosAdd appName={appName} />,
    "ios-home": <IosHome appName={appName} />,
    "ios-allow": <IosAllow appName={appName} />,
    "android-allow": <AndroidAllow appName={appName} />,
    "desktop-allow": <DesktopAllow appName={appName} />,
    "ios-unblock": <IosUnblock appName={appName} />,
    "android-unblock": <AndroidUnblock appName={appName} />,
    "desktop-unblock": <DesktopUnblock appName={appName} />,
  };
  return (
    <svg viewBox={`0 0 ${w + 4} ${h + 4}`} role="presentation" aria-hidden className={className} data-scene={scene} focusable="false">
      <g transform="translate(0 0)">{art[scene]}</g>
    </svg>
  );
}
