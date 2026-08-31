import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error: pErr }, { data: sessions, error: sErr }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, photo_url, position, department, rating"),
      supabaseAdmin.from("chat_sessions").select("user_id, score").eq("completed", true),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (sErr) throw new Error(sErr.message);

    const agg = new Map<string, { sum: number; n: number }>();
    (sessions ?? []).forEach((s: any) => {
      if (s.score == null) return;
      const cur = agg.get(s.user_id) ?? { sum: 0, n: 0 };
      cur.sum += Number(s.score);
      cur.n += 1;
      agg.set(s.user_id, cur);
    });

    return ((profiles ?? []) as any[]).map((p) => {
      const a = agg.get(p.id);
      return {
        id: p.id as string,
        full_name: p.full_name as string,
        photo_url: (p.photo_url ?? null) as string | null,
        position: (p.position ?? null) as string | null,
        department: (p.department ?? null) as string | null,
        rating: (p.rating ?? 0) as number,
        avgScore: a ? a.sum / a.n : null,
      };
    });
  });
