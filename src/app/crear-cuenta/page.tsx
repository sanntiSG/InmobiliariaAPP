import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata = { title: "Crear cuenta" };

export default async function CrearCuentaPage() {
  const session = await auth().catch(() => null);
  if (session?.user) redirect("/");

  return (
    <AuthShell
      title="Creá tu cuenta"
      subtitle="Explorar no necesita cuenta — pero con una vas a poder guardar propiedades, comentar y recibir recomendaciones."
      footer={
        <>
          ¿Ya tenés cuenta?{" "}
          <Link href="/ingresar" className="font-medium text-accent hover:underline">
            Ingresá
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
