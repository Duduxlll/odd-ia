import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard-shell";
import { AUTH_COOKIE_NAME, getSessionFromToken } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/dashboard";

export default async function Home() {
  await connection();

  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) {
    redirect("/login");
  }

  const snapshot = await getDashboardSnapshot(session.username);

  return <DashboardShell initialSnapshot={snapshot} currentUsername={session.username} />;
}
