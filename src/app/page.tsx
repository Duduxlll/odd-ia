import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardSnapshot } from "@/lib/dashboard";

export default async function Home() {
  await connection();
  const snapshot = await getDashboardSnapshot();

  return <DashboardShell initialSnapshot={snapshot} />;
}
