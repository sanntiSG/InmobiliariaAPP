import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Ingresar" };

export default async function IngresarPage() {
  const session = await auth().catch(() => null);
  if (session?.user) redirect("/");

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
      <LoginForm />
    </AuthShell>
  );
}
