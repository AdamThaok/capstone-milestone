import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";

export default async function Dashboard() {
  const jar = await cookies();
  if (jar.get("session")?.value !== "ok") redirect("/login");
  return <DashboardClient />;
}
