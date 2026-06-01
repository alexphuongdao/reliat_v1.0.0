"use client";

/**
 * Logout endpoint. Clears the token and bounces to /login. Until the
 * top-bar account menu is wired up (Milestone D), this is the
 * in-app way to sign out.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../../lib/auth";

export default function LogoutPage() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    logout();
    router.replace("/login");
  }, [logout, router]);

  return null;
}
