import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { MessageSquare, Brain, ArrowRight, ClipboardCheck } from "lucide-react";
import learningHero from "@/assets/learning-hero.png";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Главная — Bereke AI" }] }),
  component: Index,
});

type Profile = { full_name: string; position: string | null };

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    supabase.from("profiles").select("full_name, position").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) navigate({ to: "/onboarding" });
        else setProfile(data);
      });
  }, [user, loading, navigate]);

  if (!profile) return null;

  return (
    <AppShell title="Главная">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="rounded-2xl gradient-success text-success-foreground px-5 py-4 shadow-card">
          <p className="text-lg font-semibold">Добро пожаловать</p>
          <p className="text-sm opacity-90 mt-0.5">{profile.full_name}</p>
        </div>

        <div className="rounded-2xl bg-primary text-primary-foreground px-5 py-3.5 shadow-card">
          <p className="text-sm"><span className="font-semibold">Ваша роль:</span> {profile.position}</p>
        </div>

        <Link to="/materials" className="block group">
          <div className="rounded-lg overflow-hidden shadow-card bg-card border">
            <img src={learningHero} alt="Учебные материалы" className="w-full max-h-56 object-cover" />
            <div className="bg-primary text-primary-foreground py-3.5 text-center font-semibold tap group-hover:opacity-90 flex items-center justify-center gap-2">
              ☰ Перейти на материалы
            </div>
          </div>
        </Link>

        <section className="rounded-lg bg-primary text-primary-foreground p-4 space-y-3 shadow-card">
          <h2 className="text-lg font-bold">ИИ инструменты</h2>
          <Link to="/tests" className="tap flex items-center justify-between bg-white/15 hover:bg-white/25 rounded-md px-4 py-3 font-semibold">
            <span className="flex items-center gap-2"><ClipboardCheck className="size-5" /> Тестирование с ИИ</span>
            <ArrowRight className="size-5 opacity-80" />
          </Link>
          <Link to="/trainers" className="tap flex items-center justify-between bg-white/15 hover:bg-white/25 rounded-md px-4 py-3 font-semibold">
            <span className="flex items-center gap-2"><Brain className="size-5" /> ИИ тренажёры</span>
            <ArrowRight className="size-5 opacity-80" />
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
