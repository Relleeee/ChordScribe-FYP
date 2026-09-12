import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listAnalyses } from "@/lib/analyses";
import { AppShell } from "@/components/AppShell";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const analyses = await listAnalyses(user.id);
  return <AppShell user={user} initialAnalyses={analyses} />;
}
