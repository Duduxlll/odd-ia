import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AUTH_COOKIE_NAME, getSessionFromToken } from "@/lib/auth";
import { getActiveProgressionSession, getAllProgressionSessions } from "@/lib/db";
import { ProgressionShell } from "@/components/progression-shell";

export default async function ProgressionPage() {
  await connection();

  const cookieStore = await cookies();
  const session = getSessionFromToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session) redirect("/login");

  const [active, history] = await Promise.all([
    getActiveProgressionSession(session.username),
    getAllProgressionSessions(session.username),
  ]);

  return <ProgressionShell initialActive={active} initialHistory={history} />;
}
