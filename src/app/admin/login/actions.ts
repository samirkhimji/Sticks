"use server";

import { redirect } from "next/navigation";
import { checkPassword, setAdminCookie, adminAuthConfigured } from "@/lib/adminAuth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");
  if (!adminAuthConfigured()) {
    redirect(`/admin/login?error=config&next=${encodeURIComponent(next)}`);
  }
  if (!checkPassword(password)) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }
  await setAdminCookie();
  redirect(next.startsWith("/admin") ? next : "/admin");
}
