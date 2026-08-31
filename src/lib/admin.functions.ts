import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

// Kept for backwards compatibility (initial seed list). Authority now comes from public.user_roles.
export const ADMIN_EMAILS = ["1@gmail.com", "4@gmail.com"];

async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function assertAdminUserId(userId: string) {
  if (!(await isAdmin(userId))) throw new Error("Доступ запрещён");
}

async function countAdmins(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const TRAINER_KINDS = ["roleplay", "products_roleplay", "limits_roleplay", "collateral_roleplay"];

export const isCurrentUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return { isAdmin: await isAdmin(context.userId) };
  });

export const clearAllTrainerHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUserId(context.userId);
    const { data: sessions, error: selErr } = await supabaseAdmin
      .from("chat_sessions").select("id").in("kind", TRAINER_KINDS);
    if (selErr) throw new Error(selErr.message);
    const ids = (sessions ?? []).map((s: any) => s.id);
    if (ids.length) {
      const { error: msgErr } = await supabaseAdmin.from("chat_messages").delete().in("session_id", ids);
      if (msgErr) throw new Error(msgErr.message);
      const { error: sesErr } = await supabaseAdmin.from("chat_sessions").delete().in("id", ids);
      if (sesErr) throw new Error(sesErr.message);
    }
    const { error: rErr } = await supabaseAdmin.from("profiles").update({ rating: 0 }).gte("rating", 0);
    if (rErr) throw new Error(rErr.message);
    return { ok: true, deleted: ids.length };
  });

function mask(key: string | null | undefined) {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export const getOpenAiKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUserId(context.userId);
    const { data } = await supabaseAdmin
      .from("app_settings").select("value, updated_at").eq("key", "openai_api_key").maybeSingle();
    return { hasKey: !!data?.value, masked: mask(data?.value), updatedAt: data?.updated_at ?? null };
  });

const SaveInput = z.object({ apiKey: z.string().trim().min(10).max(500) });

export const saveOpenAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "openai_api_key", value: data.apiKey, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOpenAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUserId(context.userId);
    await supabaseAdmin.from("app_settings").delete().eq("key", "openai_api_key");
    return { ok: true };
  });

const PROMPT_KEY = "products_chat_prompt";

export const getProductsChatPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUserId(context.userId);
    const { DEFAULT_PRODUCTS_CHAT_PROMPT } = await import("./products-chat.functions");
    const { data } = await supabaseAdmin
      .from("app_settings").select("value, updated_at").eq("key", PROMPT_KEY).maybeSingle();
    const custom = data?.value?.toString() ?? null;
    return {
      defaultPrompt: DEFAULT_PRODUCTS_CHAT_PROMPT,
      prompt: custom ?? DEFAULT_PRODUCTS_CHAT_PROMPT,
      isCustom: !!custom,
      updatedAt: data?.updated_at ?? null,
    };
  });

const SavePromptInput = z.object({ prompt: z.string().trim().min(50).max(20000) });

export const saveProductsChatPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SavePromptInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: PROMPT_KEY, value: data.prompt, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetProductsChatPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUserId(context.userId);
    await supabaseAdmin.from("app_settings").delete().eq("key", PROMPT_KEY);
    return { ok: true };
  });

// ===== User management =====

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminUserId(context.userId);
    const [{ data: profiles, error: pErr }, { data: sessions, error: sErr }, { data: roles, error: rErr }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, photo_url, department, position, rating, created_at"),
      supabaseAdmin.from("chat_sessions").select("user_id, kind, score, completed"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (sErr) throw new Error(sErr.message);
    if (rErr) throw new Error(rErr.message);

    const adminSet = new Set<string>(((roles ?? []) as any[]).filter((r) => r.role === "admin").map((r) => r.user_id));

    const stat = new Map<string, { trainerCount: number; trainerSum: number; trainerScored: number }>();
    for (const s of (sessions ?? []) as any[]) {
      if (!s.completed) continue;
      if (!TRAINER_KINDS.includes(s.kind)) continue;
      const cur = stat.get(s.user_id) ?? { trainerCount: 0, trainerSum: 0, trainerScored: 0 };
      cur.trainerCount += 1;
      if (s.score != null) { cur.trainerSum += Number(s.score); cur.trainerScored += 1; }
      stat.set(s.user_id, cur);
    }

    return ((profiles ?? []) as any[]).map((p) => {
      const st = stat.get(p.id);
      return {
        id: p.id as string,
        email: p.email as string,
        full_name: p.full_name as string,
        photo_url: (p.photo_url ?? null) as string | null,
        department: (p.department ?? null) as string | null,
        position: (p.position ?? null) as string | null,
        rating: Number(p.rating ?? 0),
        trainerCount: st?.trainerCount ?? 0,
        avgTrainerScore: st && st.trainerScored ? st.trainerSum / st.trainerScored : null,
        isAdmin: adminSet.has(p.id),
      };
    });
  });

const UserIdInput = z.object({ userId: z.string().uuid() });

export const getUserDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UserIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    const [{ data: profile, error: pErr }, { data: sessions, error: sErr }, { data: roles, error: rErr }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("chat_sessions").select("*").eq("user_id", data.userId).eq("completed", true).order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId).eq("role", "admin").maybeSingle(),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (sErr) throw new Error(sErr.message);
    if (rErr) throw new Error(rErr.message);
    if (!profile) throw new Error("Пользователь не найден");
    return { profile, sessions: sessions ?? [], isAdmin: !!roles };
  });

const UpdateUserInput = z.object({
  userId: z.string().uuid(),
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  department: z.string().trim().max(200).nullable().optional(),
  position: z.string().trim().max(200).nullable().optional(),
});

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateUserInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    const email = data.email.toLowerCase();
    const { data: dupe } = await supabaseAdmin
      .from("profiles").select("id").eq("email", email).neq("id", data.userId).maybeSingle();
    if (dupe) throw new Error("Этот email уже используется другим пользователем");

    const { error: uErr } = await supabaseAdmin.from("profiles").update({
      full_name: data.full_name, email,
      department: data.department ?? null, position: data.position ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.userId);
    if (uErr) throw new Error(uErr.message);

    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { email });
    if (aErr) throw new Error(aErr.message);
    return { ok: true };
  });

export const deleteUserById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UserIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    if (data.userId === context.userId) throw new Error("Нельзя удалить собственный аккаунт через админ-панель");
    // If target is admin, ensure they aren't the last admin
    if (await isAdmin(data.userId)) {
      const n = await countAdmins();
      if (n <= 1) throw new Error("Нельзя удалить последнего администратора. В системе должен остаться хотя бы один администратор.");
    }
    await supabaseAdmin.from("chat_messages").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("chat_sessions").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearUserHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UserIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    const { data: sessions, error: selErr } = await supabaseAdmin
      .from("chat_sessions").select("id").eq("user_id", data.userId);
    if (selErr) throw new Error(selErr.message);
    const ids = (sessions ?? []).map((s: any) => s.id);
    if (ids.length) {
      await supabaseAdmin.from("chat_messages").delete().in("session_id", ids);
      await supabaseAdmin.from("chat_sessions").delete().in("id", ids);
    }
    await supabaseAdmin.from("profiles").update({ rating: 0 }).eq("id", data.userId);
    return { ok: true, deleted: ids.length };
  });

// ===== Role management =====

export const grantAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UserIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UserIdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminUserId(context.userId);
    const n = await countAdmins();
    if (n <= 1) throw new Error("Нельзя убрать права у последнего администратора. В системе должен остаться хотя бы один администратор.");
    const { error } = await supabaseAdmin
      .from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
