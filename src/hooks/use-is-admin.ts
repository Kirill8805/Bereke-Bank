import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { isCurrentUserAdmin } from "@/lib/admin.functions";
import { useAuth } from "./use-auth";

export function useIsAdmin() {
  const { user, loading } = useAuth();
  const check = useServerFn(isCurrentUserAdmin);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setIsAdmin(false); return; }
    let cancelled = false;
    check({ data: undefined as any })
      .then((r) => { if (!cancelled) setIsAdmin(!!r?.isAdmin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [user, loading]);

  return { isAdmin, loading: loading || isAdmin === null };
}
