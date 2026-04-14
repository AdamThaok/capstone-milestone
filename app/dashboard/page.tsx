import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "./logout-button";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="container">
      <div className="card">
        <h1>Welcome</h1>
        <p className="sub">{user.email}</p>
        <p style={{ color: "#aaa", fontSize: ".9rem", marginBottom: "1.5rem" }}>
          You are signed in. This is the capstone milestone demo — OPM to full-stack code generator.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
