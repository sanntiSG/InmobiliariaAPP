import { buildWhatsappLink } from "@/config/site";
import { Card } from "@/components/ui/Card";
import { buttonClasses } from "@/components/ui/Button";
import type { PropertyDetail } from "./types";

export function AgencyContactCard({
  agency,
  propertyTitle,
}: {
  agency: NonNullable<PropertyDetail["agency"]>;
  propertyTitle: string;
}) {
  const message = `Hola! Te escribo por "${propertyTitle}" que vi en Umbral.`;
  const whatsappHref = agency.whatsapp ? buildWhatsappLink(message, agency.whatsapp) : null;

  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Publica</p>
      <p className="mt-1 font-display text-lg font-bold text-text">{agency.name}</p>

      <div className="mt-4 flex flex-col gap-2">
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md", "w-full")}>
            <WhatsappIcon />
            Contactar por WhatsApp
          </a>
        )}
        {agency.phone && (
          <a href={`tel:${agency.phone}`} className={buttonClasses("secondary", "md", "w-full")}>
            Llamar
          </a>
        )}
        {agency.email && (
          <a href={`mailto:${agency.email}`} className={buttonClasses("ghost", "md", "w-full")}>
            Enviar email
          </a>
        )}
      </div>
    </Card>
  );
}

function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M12.02 2C6.5 2 2 6.48 2 12c0 1.83.5 3.55 1.36 5.03L2 22l5.1-1.33A9.96 9.96 0 0 0 12.02 22C17.54 22 22 17.52 22 12S17.54 2 12.02 2Zm0 18.1c-1.6 0-3.14-.43-4.47-1.24l-.32-.19-3.03.79.8-2.95-.2-.3A8.1 8.1 0 1 1 20.13 12a8.1 8.1 0 0 1-8.11 8.1Zm4.47-6.06c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.28.18-.53.06-.24-.12-1.03-.38-1.96-1.21-.72-.65-1.21-1.44-1.35-1.68-.14-.24-.02-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}
