import { getCurrentUser } from "@/lib/auth";
import { listAnalyses } from "@/lib/analyses";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json({ analyses: await listAnalyses(user.id) });
}
