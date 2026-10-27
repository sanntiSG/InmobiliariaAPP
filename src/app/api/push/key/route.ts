import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

/**
 * La clave PÚBLICA para suscribirse a los avisos del dispositivo (o `null` si este despliegue no tiene claves VAPID). Es pública
 * por diseño; la privada nunca sale del servidor. Se pide en tiempo de ejecución (no se incrusta en el build): al cargar las
 * claves en Netlify alcanza con volver a publicar.
 */
export async function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() }, { headers: { "Cache-Control": "no-store" } });
}
