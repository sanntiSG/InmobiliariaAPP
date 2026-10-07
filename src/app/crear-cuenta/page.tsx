import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { AccountTypeChooser } from "@/components/auth/AccountTypeChooser";
import { getFreshAccount } from "@/lib/auth/fresh-account";

export const metadata = { title: "Crear cuenta" };

const MANAGE_URL = "/solicitar-inmobiliaria";

export default async function CrearCuentaPage({ searchParams }: PageProps<"/crear-cuenta">) {
  const tipoParam = (await searchParams).tipo;
  const tipo = tipoParam === "explorar" || tipoParam === "gestionar" ? tipoParam : null;

  const session = await auth().catch(() => null);
  // Sólo si la cuenta sigue existiendo (una cookie de una cuenta borrada puede volver a registrarse).
  if (session?.user?.id && (await getFreshAccount(session.user.id))) redirect(tipo === "gestionar" ? MANAGE_URL : "/");

  // Paso 1: elegir qué se quiere hacer.
  if (!tipo) {
    return (
      <AuthShell
        wide
        title="¿Qué querés hacer?"
        subtitle="Elegí cómo vas a usar la plataforma. Después creás tu cuenta en un paso."
        footer={
          <>
            ¿Ya tenés cuenta?{" "}
            <Link href="/ingresar" className="font-medium text-accent hover:underline">
              Ingresá
            </Link>
          </>
        }
      >
        <AccountTypeChooser />
      </AuthShell>
    );
  }

  // Paso 2: datos de la cuenta.
  const managing = tipo === "gestionar";
  return (
    <AuthShell
      title="Creá tu cuenta"
      subtitle={
        managing
          ? "Primero creás tu cuenta; después completás la solicitud para gestionar tu inmobiliaria y el equipo se pone en contacto con vos."
          : "Explorar no necesita cuenta — pero con una vas a poder guardar propiedades, comentar y recibir recomendaciones."
      }
      footer={
        <>
          ¿Ya tenés cuenta?{" "}
          <Link
            href={managing ? `/ingresar?callbackUrl=${encodeURIComponent(MANAGE_URL)}` : "/ingresar"}
            className="font-medium text-accent hover:underline"
          >
            Ingresá
          </Link>
          {" · "}
          <Link href="/crear-cuenta" className="font-medium text-accent hover:underline">
            Cambiar tipo de cuenta
          </Link>
        </>
      }
    >
      <RegisterForm callbackUrl={managing ? MANAGE_URL : "/"} />
    </AuthShell>
  );
}
