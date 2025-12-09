import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function useAuth(requireAuth = true) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (requireAuth && status === "unauthenticated") {
      // Preserve current path as callbackUrl so user returns here after login
      const callbackUrl = encodeURIComponent(pathname || "/");
      window.location.href = `/auth/signin?callbackUrl=${callbackUrl}`;
    }
  }, [requireAuth, status, pathname]);

  return { session, status };
} 