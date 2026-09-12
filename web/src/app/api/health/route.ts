import { engineHealth } from "@/lib/engine";

export async function GET(): Promise<Response> {
  const engine = await engineHealth();
  return Response.json(
    { ok: true, engine },
    { status: engine.ok ? 200 : 503 },
  );
}
