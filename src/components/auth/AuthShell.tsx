import type { ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(60% 50% at 50% 0%, var(--accent-soft) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mb-8">
          <Logo href="/" />
        </div>

        <div className="w-full max-w-sm rounded-card bg-surface p-7 shadow-card">
          <h1 className="font-display text-2xl font-bold text-text">{title}</h1>
          <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-sm text-text-muted">{footer}</p>
      </div>
    </main>
  );
}
