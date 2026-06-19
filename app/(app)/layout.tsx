"use client";

import AppNav from "@/components/AppNav";
import RequireAuth from "@/components/RequireAuth";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppNav />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth shell={(content) => <AppShell>{content}</AppShell>}>
      {children}
    </RequireAuth>
  );
}
