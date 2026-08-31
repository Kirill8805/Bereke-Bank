import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  getOpenAiKeyStatus, saveOpenAiKey, deleteOpenAiKey,
  getProductsChatPrompt, saveProductsChatPrompt, resetProductsChatPrompt,
  clearAllTrainerHistory,
  listUsers, getUserDetails, updateUser, deleteUserById, clearUserHistory,
  grantAdmin, revokeAdmin,
} from "@/lib/admin.functions";
import { toast } from "sonner";
import {
  Loader2, KeyRound, Trash2, MessageSquare, RotateCcw, History,
  Search, Eye, Pencil, Users, Shield, ShieldOff, X, Star,
} from "lucide-react";


export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Админ — Bereke AI" }] }),
  component: AdminPage,
});

type UserRow = {
  id: string; email: string; full_name: string; photo_url: string | null;
  department: string | null; position: string | null; rating: number;
  trainerCount: number; avgTrainerScore: number | null; isAdmin: boolean;
};

function AdminPage() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const getStatus = useServerFn(getOpenAiKeyStatus);
  const saveKey = useServerFn(saveOpenAiKey);
  const deleteKey = useServerFn(deleteOpenAiKey);
  const getPrompt = useServerFn(getProductsChatPrompt);
  const savePrompt = useServerFn(saveProductsChatPrompt);
  const resetPrompt = useServerFn(resetProductsChatPrompt);
  const clearHistory = useServerFn(clearAllTrainerHistory);
  const fetchUsers = useServerFn(listUsers);
  const fetchUserDetails = useServerFn(getUserDetails);
  const doUpdateUser = useServerFn(updateUser);
  const doDeleteUser = useServerFn(deleteUserById);
  const doClearUserHistory = useServerFn(clearUserHistory);
  const doGrantAdmin = useServerFn(grantAdmin);
  const doRevokeAdmin = useServerFn(revokeAdmin);

  const [clearBusy, setClearBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const [status, setStatus] = useState<{ hasKey: boolean; masked: string | null; updatedAt: string | null } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [promptText, setPromptText] = useState("");
  const [promptDefault, setPromptDefault] = useState("");
  const [promptIsCustom, setPromptIsCustom] = useState(false);
  const [promptUpdatedAt, setPromptUpdatedAt] = useState<string | null>(null);
  const [promptBusy, setPromptBusy] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");

  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearUserId, setConfirmClearUserId] = useState<string | null>(null);
  const [grantTargetId, setGrantTargetId] = useState<string | null>(null);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);


  useEffect(() => {
    if (loading || adminLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (!isAdmin) return;
    getStatus({ data: undefined as any })
      .then((s) => setStatus(s))
      .catch((e) => toast.error(e?.message ?? "Ошибка загрузки"))
      .finally(() => setLoaded(true));
    getPrompt({ data: undefined as any })
      .then((p) => { setPromptText(p.prompt); setPromptDefault(p.defaultPrompt); setPromptIsCustom(p.isCustom); setPromptUpdatedAt(p.updatedAt); })
      .catch((e) => toast.error(e?.message ?? "Ошибка загрузки промпта"));
    void reloadUsers();
  }, [user, loading, adminLoading, isAdmin, navigate]);

  async function reloadUsers() {
    setUsersLoading(true);
    try {
      const list = await fetchUsers({ data: undefined as any });
      setUsers(list as UserRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось загрузить пользователей");
    } finally {
      setUsersLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter === "admin" && !u.isAdmin) return false;
      if (roleFilter === "user" && u.isAdmin) return false;
      if (!q) return true;
      return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter]);

  const adminCount = useMemo(() => users.filter((u) => u.isAdmin).length, [users]);

  const totals = useMemo(() => {
    const totalUsers = users.length;
    const totalTrainings = users.reduce((a, u) => a + u.trainerCount, 0);
    const scored = users.filter((u) => u.avgTrainerScore != null);
    const avg = scored.length ? scored.reduce((a, u) => a + (u.avgTrainerScore ?? 0), 0) / scored.length : null;
    return { totalUsers, totalTrainings, avg };
  }, [users]);

  if (loading || adminLoading) {
    return (
      <AppShell title="Админ-панель" back="/">
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }


  if (!isAdmin) {
    return (
      <AppShell title="Админ-панель" back="/">
        <div className="bg-card border rounded-xl p-6 text-center">
          <p className="font-semibold">У вас нет доступа к админ-панели</p>
          <p className="text-sm text-muted-foreground mt-2">Эта страница доступна только администратору.</p>
        </div>
      </AppShell>
    );
  }

  const onSave = async () => {
    const k = apiKey.trim();
    if (k.length < 10) { toast.error("Введите корректный API ключ"); return; }
    setBusy(true);
    try {
      await saveKey({ data: { apiKey: k } });
      toast.success("API ключ сохранён"); setApiKey("");
      const s = await getStatus({ data: undefined as any }); setStatus(s);
    } catch (e: any) { toast.error(e?.message ?? "Не удалось сохранить"); }
    finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!confirm("Удалить сохранённый API ключ? ИИ переключится обратно на встроенный шлюз.")) return;
    setBusy(true);
    try { await deleteKey({ data: undefined as any }); toast.success("Ключ удалён");
      const s = await getStatus({ data: undefined as any }); setStatus(s);
    } catch (e: any) { toast.error(e?.message ?? "Не удалось удалить"); }
    finally { setBusy(false); }
  };

  const onSavePrompt = async () => {
    const p = promptText.trim();
    if (p.length < 50) { toast.error("Промпт слишком короткий"); return; }
    setPromptBusy(true);
    try {
      await savePrompt({ data: { prompt: p } }); toast.success("Промпт сохранён");
      const fresh = await getPrompt({ data: undefined as any });
      setPromptText(fresh.prompt); setPromptIsCustom(fresh.isCustom); setPromptUpdatedAt(fresh.updatedAt);
    } catch (e: any) { toast.error(e?.message ?? "Не удалось сохранить"); }
    finally { setPromptBusy(false); }
  };

  const onResetPrompt = async () => {
    if (!confirm("Сбросить промпт к стандартному?")) return;
    setPromptBusy(true);
    try {
      await resetPrompt({ data: undefined as any }); toast.success("Промпт сброшен");
      const fresh = await getPrompt({ data: undefined as any });
      setPromptText(fresh.prompt); setPromptIsCustom(fresh.isCustom); setPromptUpdatedAt(fresh.updatedAt);
    } catch (e: any) { toast.error(e?.message ?? "Не удалось сбросить"); }
    finally { setPromptBusy(false); }
  };

  return (
    <AppShell title="Админ-панель" back="/">
      <div className="space-y-4">
        <div className="bg-card border rounded-xl p-4">
          <h1 className="text-lg font-bold">Админ-панель</h1>
          <p className="text-sm text-muted-foreground mt-1">Управление пользователями и историей прохождения тренировок.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="Пользователей" value={totals.totalUsers} icon={<Users className="size-4" />} />
            <Stat label="Тренировок" value={totals.totalTrainings} icon={<History className="size-4" />} />
            <Stat label="Ср. оценка" value={totals.avg != null ? totals.avg.toFixed(1) : "—"} icon={<Star className="size-4" />} />
          </div>
        </div>

        {/* Users */}
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Users className="size-5" /></div>
              <div>
                <p className="font-semibold">Пользователи</p>
                <p className="text-xs text-muted-foreground">{filteredUsers.length} из {users.length}</p>
              </div>
            </div>
            <button onClick={() => void reloadUsers()} className="tap text-xs text-primary hover:underline">Обновить</button>
          </div>

          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по имени или email"
                className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs">
              {([
                ["all", "Все"],
                ["admin", "Администраторы"],
                ["user", "Пользователи"],
              ] as const).map(([v, l]) => (
                <button key={v} onClick={() => setRoleFilter(v)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${roleFilter === v ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Пользователь</th>
                  <th className="py-2 pr-3 font-medium">Роль</th>
                  <th className="py-2 pr-3 font-medium">Должность / Отдел</th>
                  <th className="py-2 pr-3 font-medium text-center">Тренировок</th>
                  <th className="py-2 pr-3 font-medium text-center">Ср. оценка</th>
                  <th className="py-2 pr-3 font-medium text-center">Рейтинг</th>
                  <th className="py-2 pr-3 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground"><Loader2 className="size-4 animate-spin inline" /></td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Никого не найдено</td></tr>
                ) : filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-md bg-muted overflow-hidden flex items-center justify-center font-semibold text-xs">
                          {u.photo_url ? <img src={u.photo_url} className="size-full object-cover" /> : (u.full_name[0] ?? "?")}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5">
                            {u.full_name}
                            {u.isAdmin && <Shield className="size-3 text-primary" />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                          <Shield className="size-3" /> Администратор
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                          Пользователь
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <div>{u.position ?? "—"}</div>
                      <div className="text-muted-foreground">{u.department ?? "—"}</div>
                    </td>
                    <td className="py-2 pr-3 text-center tabular-nums">{u.trainerCount}</td>
                    <td className="py-2 pr-3 text-center tabular-nums">{u.avgTrainerScore != null ? u.avgTrainerScore.toFixed(1) : "—"}</td>
                    <td className="py-2 pr-3 text-center tabular-nums">{Number(u.rating).toFixed(1)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Просмотр" onClick={() => setViewUserId(u.id)}><Eye className="size-4" /></IconBtn>
                        <IconBtn title="Редактировать" onClick={() => setEditUserId(u.id)}><Pencil className="size-4" /></IconBtn>
                        {u.isAdmin ? (
                          <IconBtn title="Убрать админку" tone="warning" onClick={() => setRevokeTargetId(u.id)}><ShieldOff className="size-4" /></IconBtn>
                        ) : (
                          <IconBtn title="Сделать админом" onClick={() => setGrantTargetId(u.id)}><Shield className="size-4" /></IconBtn>
                        )}
                        <IconBtn title="Очистить историю" tone="warning" onClick={() => setConfirmClearUserId(u.id)}><RotateCcw className="size-4" /></IconBtn>
                        <IconBtn title="Удалить" tone="danger" onClick={() => setConfirmDeleteId(u.id)} disabled={u.id === user?.id}><Trash2 className="size-4" /></IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

        {/* OpenAI key */}
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><KeyRound className="size-5" /></div>
            <div>
              <p className="font-semibold">OpenAI API ключ</p>
              <p className="text-xs text-muted-foreground">Используется для тренажёров и тестов</p>
            </div>
          </div>

          {loaded && status && (
            <div className="mt-4 text-sm">
              {status.hasKey ? (
                <div className="flex items-center justify-between gap-3 bg-muted/50 rounded-lg px-3 py-2">
                  <div>
                    <div className="font-mono">{status.masked}</div>
                    {status.updatedAt && <div className="text-xs text-muted-foreground">Обновлён: {new Date(status.updatedAt).toLocaleString("ru-RU")}</div>}
                  </div>
                  <button onClick={onDelete} disabled={busy} className="tap inline-flex items-center gap-1 text-destructive text-xs font-medium hover:underline disabled:opacity-50">
                    <Trash2 className="size-3.5" /> Удалить
                  </button>
                </div>
              ) : (
                <p className="text-muted-foreground">Ключ не задан — используется встроенный ИИ шлюз Lovable.</p>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Новый API ключ (sk-...)</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
            <button onClick={onSave} disabled={busy || !apiKey.trim()}
              className="tap w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" />} Сохранить ключ
            </button>
          </div>
        </div>

        {/* Prompt */}
        <div className="bg-card border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><MessageSquare className="size-5" /></div>
            <div>
              <p className="font-semibold">Промпт ИИ тренажёра — Чат с клиентом по продуктам</p>
              <p className="text-xs text-muted-foreground">
                Плейсхолдеры: <code className="font-mono">{"{{BOT_NAME}}"}</code>, <code className="font-mono">{"{{QA_BLOCK}}"}</code>, <code className="font-mono">{"{{OBJECTIONS}}"}</code>
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className={promptIsCustom ? "text-primary font-medium" : "text-muted-foreground"}>
              {promptIsCustom ? "Используется кастомный промпт" : "Используется стандартный промпт"}
            </span>
            {promptUpdatedAt && <span className="text-muted-foreground">Обновлён: {new Date(promptUpdatedAt).toLocaleString("ru-RU")}</span>}
          </div>

          <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} spellCheck={false}
            className="mt-3 w-full min-h-[420px] rounded-lg border bg-background px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary" />

          <div className="mt-3 flex gap-2">
            <button onClick={onSavePrompt} disabled={promptBusy || !promptText.trim() || (promptText.trim() === promptDefault && !promptIsCustom)}
              className="tap flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-semibold disabled:opacity-50">
              {promptBusy && <Loader2 className="size-4 animate-spin" />} Сохранить промпт
            </button>
            <button onClick={onResetPrompt} disabled={promptBusy || !promptIsCustom}
              className="tap inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium disabled:opacity-50">
              <RotateCcw className="size-4" /> Сбросить
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-card border border-destructive/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center"><History className="size-5" /></div>
            <div>
              <p className="font-semibold text-destructive">Опасные действия</p>
              <p className="text-xs text-muted-foreground">Очистка истории тренировок у всех пользователей</p>
            </div>
          </div>

          {!confirmClear ? (
            <button onClick={() => setConfirmClear(true)} disabled={clearBusy}
              className="tap mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 text-destructive py-2.5 text-sm font-semibold disabled:opacity-50">
              <Trash2 className="size-4" /> Очистить историю всех пользователей
            </button>
          ) : (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm">Вы уверены, что хотите очистить историю прохождения тренировок у всех пользователей? Это действие нельзя отменить. Аккаунты пользователей останутся, но все результаты тренировок будут удалены.</p>
              <div className="mt-3 flex gap-2">
                <button disabled={clearBusy} onClick={() => setConfirmClear(false)}
                  className="tap flex-1 rounded-lg border bg-background py-2 text-sm font-medium disabled:opacity-50">Отмена</button>
                <button disabled={clearBusy}
                  onClick={async () => {
                    setClearBusy(true);
                    try {
                      const res: any = await clearHistory({ data: undefined as any });
                      toast.success(`История очищена (${res?.deleted ?? 0} сессий)`);
                      setConfirmClear(false);
                      await reloadUsers();
                    } catch (e: any) { toast.error(e?.message ?? "Не удалось очистить"); }
                    finally { setClearBusy(false); }
                  }}
                  className="tap flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-destructive text-destructive-foreground py-2 text-sm font-semibold disabled:opacity-50">
                  {clearBusy && <Loader2 className="size-4 animate-spin" />} Да, очистить всё
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewUserId && (
        <ViewUserModal userId={viewUserId} fetchDetails={fetchUserDetails} onClose={() => setViewUserId(null)} />
      )}
      {editUserId && (
        <EditUserModal
          userId={editUserId}
          fetchDetails={fetchUserDetails}
          onSave={async (payload) => { await doUpdateUser({ data: payload }); toast.success("Сохранено"); setEditUserId(null); await reloadUsers(); }}
          onClose={() => setEditUserId(null)}
        />
      )}
      {confirmDeleteId && (
        <ConfirmModal
          title="Удалить пользователя?"
          description="Вы уверены, что хотите удалить пользователя? Это действие нельзя отменить. История тренировок этого пользователя также будет удалена."
          confirmText="Удалить пользователя"
          tone="danger"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={async () => { await doDeleteUser({ data: { userId: confirmDeleteId } }); toast.success("Пользователь удалён"); setConfirmDeleteId(null); await reloadUsers(); }}
        />
      )}
      {confirmClearUserId && (
        <ConfirmModal
          title="Очистить историю?"
          description="Вы уверены, что хотите очистить историю прохождения тренировок у этого пользователя? Аккаунт пользователя останется, но все результаты тренировок будут удалены."
          confirmText="Очистить историю"
          tone="warning"
          onCancel={() => setConfirmClearUserId(null)}
          onConfirm={async () => { await doClearUserHistory({ data: { userId: confirmClearUserId } }); toast.success("История очищена"); setConfirmClearUserId(null); await reloadUsers(); }}
        />
      )}
      {grantTargetId && (
        <ConfirmModal
          title="Сделать админом?"
          description="Вы уверены, что хотите выдать этому пользователю права администратора? Он получит доступ к админ-панели и управлению пользователями."
          confirmText="Сделать админом"
          tone="warning"
          onCancel={() => setGrantTargetId(null)}
          onConfirm={async () => {
            await doGrantAdmin({ data: { userId: grantTargetId } });
            toast.success("Права администратора выданы");
            setGrantTargetId(null);
            await reloadUsers();
          }}
        />
      )}
      {revokeTargetId && (() => {
        const isSelf = revokeTargetId === user?.id;
        const isLast = adminCount <= 1;
        if (isLast) {
          return (
            <ConfirmModal
              title="Невозможно убрать"
              description="Нельзя убрать права у последнего администратора. В системе должен остаться хотя бы один администратор."
              confirmText="Понятно"
              tone="warning"
              onCancel={() => setRevokeTargetId(null)}
              onConfirm={async () => { setRevokeTargetId(null); }}
            />
          );
        }
        return (
          <ConfirmModal
            title={isSelf ? "Убрать свои права администратора?" : "Убрать админку?"}
            description={
              isSelf
                ? "Вы убираете права администратора у своего аккаунта. После этого вы потеряете доступ к админ-панели. Продолжить?"
                : "Вы уверены, что хотите убрать у этого пользователя права администратора? Он больше не сможет заходить в админ-панель."
            }
            confirmText={isSelf ? "Да, убрать мои права" : "Убрать админку"}
            tone="danger"
            onCancel={() => setRevokeTargetId(null)}
            onConfirm={async () => {
              await doRevokeAdmin({ data: { userId: revokeTargetId } });
              toast.success("Права администратора убраны");
              setRevokeTargetId(null);
              if (isSelf) { navigate({ to: "/" }); return; }
              await reloadUsers();
            }}
          />
        );
      })()}
    </AppShell>

  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="bg-muted/40 border rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="font-bold text-lg mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

function IconBtn({ children, onClick, title, tone, disabled }: { children: React.ReactNode; onClick: () => void; title: string; tone?: "danger" | "warning"; disabled?: boolean }) {
  const c = tone === "danger" ? "text-destructive hover:bg-destructive/10" : tone === "warning" ? "text-amber-600 hover:bg-amber-500/10" : "text-muted-foreground hover:bg-muted";
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className={`tap size-8 rounded-md flex items-center justify-center ${c} disabled:opacity-40 disabled:cursor-not-allowed`}>
      {children}
    </button>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className={`bg-background border rounded-xl shadow-lg w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-auto`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, description, confirmText, tone, onCancel, onConfirm }: {
  title: string; description: string; confirmText: string; tone: "danger" | "warning";
  onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onCancel}>
      <div className="p-5">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
        <div className="mt-4 flex gap-2">
          <button disabled={busy} onClick={onCancel} className="tap flex-1 rounded-lg border py-2 text-sm font-medium disabled:opacity-50">Отмена</button>
          <button disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); } catch (e: any) { toast.error(e?.message ?? "Ошибка"); } finally { setBusy(false); } }}
            className={`tap flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold disabled:opacity-50 ${tone === "danger" ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}`}>
            {busy && <Loader2 className="size-4 animate-spin" />} {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ViewUserModal({ userId, fetchDetails, onClose }: { userId: string; fetchDetails: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDetails({ data: { userId } }).then((r: any) => setData(r)).catch((e: any) => toast.error(e?.message ?? "Ошибка")).finally(() => setLoading(false));
  }, [userId]);

  const profile = data?.profile;
  const sessions: any[] = data?.sessions ?? [];
  const trainers = sessions.filter((s) => ["roleplay","products_roleplay","limits_roleplay","collateral_roleplay"].includes(s.kind));
  const scored = trainers.filter((s) => s.score != null);
  const avg = scored.length ? scored.reduce((a, s) => a + Number(s.score), 0) / scored.length : null;

  return (
    <Modal onClose={onClose} wide>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Карточка пользователя</p>
          <button onClick={onClose} className="tap text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        {loading || !profile ? (
          <div className="py-10 text-center"><Loader2 className="size-5 animate-spin inline text-muted-foreground" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Имя">{profile.full_name}</Field>
              <Field label="Email">{profile.email}</Field>
              <Field label="Должность">{profile.position ?? "—"}</Field>
              <Field label="Отдел / филиал">{profile.department ?? "—"}</Field>
              <Field label="Тренировок">{trainers.length}</Field>
              <Field label="Ср. оценка">{avg != null ? avg.toFixed(1) : "—"}</Field>
              <Field label="Общий рейтинг">{Number(profile.rating ?? 0).toFixed(1)}</Field>
            </div>

            <div>
              <p className="text-xs uppercase font-semibold text-muted-foreground mb-2">История прохождений</p>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">История тренировок пока отсутствует</p>
              ) : (
                <ul className="space-y-2">
                  {sessions.map((s) => (
                    <li key={s.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{new Date(s.created_at).toLocaleString("ru-RU")}</span>
                        <span className="font-mono">{s.kind}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-sm font-semibold"><Star className="size-3.5 fill-primary text-primary" />{s.score != null ? Number(s.score).toFixed(1) : "—"}</span>
                      </div>
                      {s.summary && <p className="mt-1.5">{s.summary}</p>}
                      {!!(s.strengths?.length) && <p className="mt-1 text-xs"><span className="text-success font-medium">Сильные:</span> {s.strengths.join("; ")}</p>}
                      {!!(s.weaknesses?.length) && <p className="mt-0.5 text-xs"><span className="text-destructive font-medium">Над чем поработать:</span> {s.weaknesses.join("; ")}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-2.5">
      <p className="text-[11px] uppercase font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5">{children}</p>
    </div>
  );
}

function EditUserModal({ userId, fetchDetails, onSave, onClose }: { userId: string; fetchDetails: any; onSave: (p: any) => Promise<void>; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", department: "", position: "" });
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    fetchDetails({ data: { userId } }).then((r: any) => {
      const p = r.profile;
      setForm({ full_name: p.full_name ?? "", email: p.email ?? "", department: p.department ?? "", position: p.position ?? "" });
      setIsAdminUser(!!r.isAdmin);
    }).catch((e: any) => toast.error(e?.message ?? "Ошибка"))
    .finally(() => setLoading(false));
  }, [userId]);

  return (
    <Modal onClose={onClose}>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Редактирование пользователя</p>
          <button onClick={onClose} className="tap text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        {loading ? (
          <div className="py-10 text-center"><Loader2 className="size-5 animate-spin inline text-muted-foreground" /></div>
        ) : (
          <div className="mt-4 space-y-3">
            <Input label="Имя" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
            <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Input label="Должность" value={form.position} onChange={(v) => setForm({ ...form, position: v })} />
            <Input label="Отдел / филиал" value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
            <div className="border rounded-lg p-2.5 bg-muted/30">
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">Роль</p>
              <p className="text-sm mt-0.5 flex items-center gap-1.5">
                {isAdminUser ? <><Shield className="size-3.5 text-primary" /> Администратор</> : "Пользователь"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Управление ролью администратора доступно через действия в таблице пользователей.</p>
            </div>

            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={onClose} className="tap flex-1 rounded-lg border py-2 text-sm font-medium disabled:opacity-50">Отмена</button>
              <button disabled={busy || !form.full_name.trim() || !form.email.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onSave({
                      userId, full_name: form.full_name.trim(), email: form.email.trim(),
                      department: form.department.trim() || null, position: form.position.trim() || null,
                    });
                  } catch (e: any) { toast.error(e?.message ?? "Не удалось сохранить"); }
                  finally { setBusy(false); }
                }}
                className="tap flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-semibold disabled:opacity-50">
                {busy && <Loader2 className="size-4 animate-spin" />} Сохранить
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase font-semibold text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
    </label>
  );
}
