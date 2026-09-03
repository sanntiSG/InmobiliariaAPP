import { redirect } from "next/navigation";
import { requireAgencyUser } from "@/lib/auth/require-agency-user";
import { connectDB } from "@/lib/db/connect";
import { Agency } from "@/lib/db/models/Agency";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const agencyUser = await requireAgencyUser();
  if (!agencyUser) redirect("/ingresar");

  await connectDB();
  const agency = await Agency.findById(agencyUser.agencyId).select("name slug").lean();
  if (!agency) redirect("/");

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/" />
            <span className="hidden text-text-muted sm:inline">/</span>
            <span className="hidden font-medium text-text sm:inline">{agency.name}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />
            <UserMenu compact />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <DashboardNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
