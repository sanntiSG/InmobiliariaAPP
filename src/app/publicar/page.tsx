import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { OnboardingAgencyForm } from "@/components/agency/OnboardingAgencyForm";
import { brand } from "@/config/brand";

export const metadata = { title: "Creá tu inmobiliaria" };

export default async function PublicarPage() {
  const session = await auth().catch(() => null);
  const user = session?.user;

  if (!user) redirect("/ingresar");
  if (user.role === "admin") redirect("/admin");
  if (user.role === "agency_owner" || user.role === "agency_agent") {
    if (user.agencyId) redirect("/dashboard");
  } else {
    // Sin permiso de agencia — no tiene nada que hacer acá.
    redirect("/");
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <Logo href="/" />
          <div className="flex items-center gap-2 sm:gap-3">
            <UserMenu compact />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Creá tu inmobiliaria</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            El admin de {brand.name} te dio acceso para publicar. Completá estos datos para crear tu
            perfil de inmobiliaria — después vas a poder cargar propiedades, fotos y recorridos 3D
            desde tu panel.
          </p>
        </div>

        <OnboardingAgencyForm />
      </div>
    </div>
  );
}
