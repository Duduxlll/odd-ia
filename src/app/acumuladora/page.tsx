import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME, getSessionFromToken, isAuthConfigured } from "@/lib/auth";
import { AcumuladoraShell } from "@/components/acumuladora-shell";

export const metadata = { title: "Múltipla Bet365" };

export default async function AcumuladoraPage() {
  if (isAuthConfigured()) {
    const cookieStore = await cookies();
    const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
    if (!session) redirect("/login");
  }
  return <AcumuladoraShell />;
}
