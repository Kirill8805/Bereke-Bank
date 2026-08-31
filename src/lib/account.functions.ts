import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { error: msgErr } = await supabaseAdmin
      .from("chat_messages")
      .delete()
      .eq("user_id", userId);
    if (msgErr) throw new Error(msgErr.message);

    const { error: sessErr } = await supabaseAdmin
      .from("chat_sessions")
      .delete()
      .eq("user_id", userId);
    if (sessErr) throw new Error(sessErr.message);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (profErr) throw new Error(profErr.message);

    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) throw new Error(authErr.message);

    return { ok: true };
  });
