import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { LoginScreen } from "@/components/login-screen";
import { AUTH_COOKIE_NAME, getSessionFromToken } from "@/lib/auth";

export default async function LoginPage() {
  await connection();

  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (session) {
    redirect("/");
  }

  return <LoginScreen />;
}
