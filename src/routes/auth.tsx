import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Вход — Bereke AI" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) checkProfile(user.id);
  }, [user, authLoading]);

  async function checkProfile(uid: string) {
    const { data } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
    navigate({ to: data ? "/" : "/onboarding" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Аккаунт создан");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Добро пожаловать");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 px-6 pt-16 pb-8 flex flex-col">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Bereke <span className="text-primary">AI</span></h1>
          <p className="text-muted-foreground mt-2 text-sm">Тренажёр для менеджеров банка</p>
        </div>

        <div className="bg-card rounded-2xl border shadow-card p-5">
          <div className="flex bg-muted rounded-xl p-1 mb-5">
            {(["signup", "signin"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 tap py-2 rounded-lg text-sm font-medium transition ${mode === m ? "bg-card shadow-soft text-foreground" : "text-muted-foreground"}`}
              >
                {m === "signup" ? "Регистрация" : "Вход"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@bereke.kz"
                className="input"
                autoComplete="email"
              />
            </Field>
            <Field label="Пароль">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="input"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="tap w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 mt-2 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signup" ? "Зарегистрироваться" : "Войти"}
            </button>
          </form>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Email сохраняется за вашим аккаунтом — заходите с любого устройства.
        </p>
      </div>
      <style>{`.input { width: 100%; height: 44px; padding: 0 14px; background: var(--color-input); border-radius: 12px; font-size: 15px; outline: none; transition: box-shadow .15s; }
.input:focus { box-shadow: 0 0 0 2px var(--color-ring); }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
