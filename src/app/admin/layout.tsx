import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdminUser();
  if (!admin) redirect("/ingresar");

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/" />
            <span className="hidden text-text-muted sm:inline">/</span>
            <span className="hidden font-medium text-text sm:inline">Admin</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <UserMenu compact />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
