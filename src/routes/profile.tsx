import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Mail, MapPin, Briefcase, Star, ThumbsUp, AlertCircle, Sparkles, LogOut, ChevronLeft, ChevronRight, FileText, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { deleteAccount } from "@/lib/account.functions";
import { useIsAdmin } from "@/hooks/use-is-admin";

const PAGE_SIZE = 5;


export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Профиль — Bereke AI" }] }),
  component: ProfilePage,
});

type Profile = { id: string; email: string; full_name: string; photo_url: string | null; department: string | null; position: string | null; rating: number };
type Session = { id: string; kind: string; score: number | null; summary: string | null; strengths: string[] | null; weaknesses: string[] | null; created_at: string; completed: boolean };

function isTest(s: Session) { return s.kind === "products" || s.kind === "knowledge" || s.kind === "limits_knowledge" || s.kind === "collateral_knowledge"; }
function isTrainer(s: Session) { return s.kind === "roleplay" || s.kind === "products_roleplay" || s.kind === "limits_roleplay" || s.kind === "collateral_roleplay" || s.kind === "voice_roleplay"; }

// Человеческие названия тренажёров/тестов для истории
const KIND_LABELS: Record<string, string> = {
  roleplay: "Чат с ИИ",
  products_roleplay: "Чат с клиентом по продуктам",
  limits_roleplay: "Тренажёр: Лимиты",
  collateral_roleplay: "Тренажёр: Залоги",
  voice_roleplay: "Голосовой ИИ тренажёр по кредитам",
  products: "Тест по продуктам",
  knowledge: "Тест B-Bonus",
  limits_knowledge: "Тест: Лимиты",
  collateral_knowledge: "Тест: Залоги",
};

function avgScore(sessions: Session[]) {
  const scored = sessions.filter((s) => s.score != null);
  return scored.length ? (scored.reduce((a, s) => a + (s.score ?? 0), 0) / scored.length).toFixed(1) : "—";
}

function ProfilePage() {
  const { user, loading } = useAuth();
  const { isAdmin } = useIsAdmin();

  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const doDelete = useServerFn(deleteAccount);


  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    void load();
  }, [user, loading]);

  async function load() {
    if (!user) return;
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("chat_sessions").select("*").eq("user_id", user.id).eq("completed", true).order("created_at", { ascending: false }),
    ]);
    setProfile(p as Profile | null);
    setSessions((s ?? []) as Session[]);
  }

  if (!profile) return null;

  const trainers = sessions.filter(isTrainer);
  const tests = sessions.filter(isTest);

  const dedupe = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of arr) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item.trim());
      if (out.length >= 15) break;
    }
    return out;
  };
  const allStrengths = dedupe(sessions.flatMap((s) => s.strengths ?? []));
  const allWeaknesses = dedupe(sessions.flatMap((s) => s.weaknesses ?? []));

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Вы вышли");
    navigate({ to: "/auth" });
  }



  async function handleDelete() {
    setDeleting(true);
    try {
      await doDelete();
      await supabase.auth.signOut();
      toast.success("Аккаунт удалён");
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <AppShell title="Профиль">
      <div className="bg-card border rounded-2xl p-5 shadow-card flex items-center gap-4">
        {profile.photo_url ? (
          <img src={profile.photo_url} className="size-20 rounded-2xl object-cover" />
        ) : (
          <div className="size-20 rounded-2xl bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
            {profile.full_name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg leading-tight">{profile.full_name}</p>
          {profile.position && <p className="text-xs uppercase font-semibold text-primary mt-0.5">{profile.position}</p>}
          <div className="flex items-center gap-1 mt-2 text-sm">
            <Star className="size-4 fill-primary text-primary" />
            <span className="font-semibold">{avgScore(trainers)}</span>
            <span className="text-muted-foreground text-xs">общий рейтинг</span>
          </div>
        </div>
      </div>

      <div className="mt-3 bg-card border rounded-2xl divide-y">
        <Info icon={<Mail className="size-4" />} label="Email" value={profile.email} />
        {profile.department && <Info icon={<MapPin className="size-4" />} label="Отдел" value={profile.department} />}
        {profile.position && <Info icon={<Briefcase className="size-4" />} label="Должность" value={profile.position} />}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Тренажёров" value={trainers.length} />
        <Stat label="Тестов" value={tests.length} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Ср. оценка трен." value={avgScore(trainers)} />
        <Stat label="Ср. оценка тестов" value={avgScore(tests)} />
      </div>

      <Block title="Сильные стороны" icon={<ThumbsUp className="size-4" />} color="success" items={allStrengths} empty="Пройдите тренировку или тест, чтобы увидеть свои сильные стороны." />
      <Block title="Над чем поработать" icon={<AlertCircle className="size-4" />} color="destructive" items={allWeaknesses} empty="После первой тренировки или теста здесь появятся рекомендации." />

      {trainers.length > 0 && <HistorySection title="История тренажёров" icon={<Sparkles className="size-4 text-primary" />} sessions={trainers} fallback="Тренажёр" />}
      {tests.length > 0 && <HistorySection title="История тестов" icon={<FileText className="size-4 text-primary" />} sessions={tests} fallback="Тест" />}


      {isAdmin && (
        <Link to="/admin" className="tap mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold">
          <Shield className="size-4" /> Админ-панель
        </Link>
      )}


      <button onClick={logout} className="tap mt-3 w-full flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium text-muted-foreground">
        <LogOut className="size-4" /> Выйти из аккаунта
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <button className="tap mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/20 py-3 text-sm font-medium text-destructive">
            <Trash2 className="size-4" /> Удалить аккаунт
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить аккаунт?</AlertDialogTitle>
            <AlertDialogDescription>
              Все ваши данные, история тренировок и тестов будут безвозвратно удалены. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <button
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-9 px-4 py-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {deleting ? "Удаление..." : "Удалить"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function HistorySection({ title, icon, sessions, fallback }: { title: string; icon: React.ReactNode; sessions: Session[]; fallback: string }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const items = sessions.slice(start, start + PAGE_SIZE);
  return (
    <section className="mt-5">
      <h3 className="font-bold mb-2 flex items-center gap-2">{icon} {title}</h3>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id} className="bg-card border rounded-xl p-3 flex items-start gap-3">
            <div className="size-10 rounded-lg gradient-primary text-primary-foreground flex items-center justify-center font-bold text-xs">{s.score != null ? Number(s.score).toFixed(1) : "—"}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{KIND_LABELS[s.kind] ?? fallback}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{new Date(s.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</p>
              <p className="text-sm line-clamp-2 mt-0.5 text-muted-foreground">{s.summary}</p>
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && <Pager page={page} totalPages={totalPages} onChange={setPage} />}
    </section>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase font-semibold text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-card border rounded-2xl p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function Block({ title, icon, color, items, empty }: { title: string; icon: React.ReactNode; color: "success" | "destructive"; items: string[]; empty: string }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  return (
    <section className="mt-5">
      <h3 className={`font-bold mb-2 flex items-center gap-2 ${color === "success" ? "text-success" : "text-destructive"}`}>
        {icon} {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-muted rounded-xl px-4 py-3">{empty}</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {pageItems.map((t, i) => (
              <li key={start + i} className="text-sm bg-card border rounded-xl px-3 py-2 flex gap-2">
                <span className={color === "success" ? "text-success" : "text-destructive"}>{color === "success" ? "✓" : "•"}</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      )}
    </section>
  );
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 mt-3">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="tap size-8 rounded-lg border flex items-center justify-center disabled:opacity-40"
        aria-label="Назад"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="text-xs text-muted-foreground tabular-nums">{page} / {totalPages}</span>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="tap size-8 rounded-lg border flex items-center justify-center disabled:opacity-40"
        aria-label="Вперёд"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
