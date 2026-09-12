import { LoginForm } from "@/components/auth/LoginForm";
import { configuredProviders } from "@/lib/oauth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return <LoginForm configured={configuredProviders()} next={next ?? "/"} error={error} />;
}
