import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PeachSidebar } from "@/components/peach-sidebar";
import { PeachUiModeProvider } from "@/components/peach-ui-mode-provider";

export default async function PeachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  return (
    <PeachUiModeProvider>
      <div className="flex min-h-screen">
        <PeachSidebar
          user={{
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            credits: user.credits,
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        </div>
      </div>
    </PeachUiModeProvider>
  );
}
