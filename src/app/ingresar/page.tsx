import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeCallbackUrl } from "@/lib/auth/safe-redirect";

export const metadata = { title: "Ingresar" };

export default async function IngresarPage({ searchParams }: PageProps<"/ingresar">) {
  const host = (await headers()).get("host");
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl, { host });

  const session = await auth().catch(() => null);
  if (session?.user) redirect(callbackUrl);

  return (
    <AuthShell
      title="Bienvenido de nuevo"
      subtitle="Ingresá para guardar propiedades, comentar y recibir recomendaciones."
      footer={
        <>
          ¿No tenés cuenta?{" "}
          <Link href="/crear-cuenta" className="font-medium text-accent hover:underline">
            Creá una gratis
          </Link>
        </>
      }
    >
      <LoginForm callbackUrl={callbackUrl} />
    </AuthShell>
  );
}
