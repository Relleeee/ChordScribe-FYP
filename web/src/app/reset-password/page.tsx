import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { peekResetToken } from "@/lib/verification";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? Boolean(await peekResetToken(token)) : false;
  return <ResetPasswordForm token={token ?? ""} valid={valid} />;
}
