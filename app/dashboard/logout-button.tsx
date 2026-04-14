"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return <button className="primary" onClick={logout}>Log out</button>;
}
