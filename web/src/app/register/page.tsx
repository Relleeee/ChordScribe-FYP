import { RegisterForm } from "@/components/auth/RegisterForm";
import { configuredProviders } from "@/lib/oauth";
import { turnstileSiteKey } from "@/lib/turnstile";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <RegisterForm
      configured={configuredProviders()}
      next={next ?? "/"}
      turnstileSiteKey={turnstileSiteKey()}
    />
  );
}
