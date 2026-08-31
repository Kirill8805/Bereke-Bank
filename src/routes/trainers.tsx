import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Phone, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/trainers")({
  head: () => ({ meta: [{ title: "ИИ тренажёры — Bereke AI" }] }),
  component: Trainers,
});

const TRAINERS = [
  {
    id: "call",
    icon: Phone,
    title: "Голосовой ИИ тренажер по кредитам",
    desc: "Голосовой ИИ тренажёр по кредитам",
    active: true,
    href: "https://video.halyktumar.kz/",
  },
  {
    id: "products",
    icon: MessageSquare,
    title: "Чат с клиентом по продуктам",
    desc: "Кредит под залог и жилищный кредит",
    active: true,
    to: "/products-chat" as const,
  },
];

function Trainers() {
  const navigate = useNavigate();
  return (
    <AppShell title="ИИ тренажёры" back="/">
      <p className="text-sm text-muted-foreground mb-4">Выберите тренажёр для тренировки навыков</p>
      <div className="space-y-3">
        {TRAINERS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => {
                if ((t as any).href) window.open((t as any).href, "_blank", "noopener,noreferrer");
                else if ((t as any).to) navigate({ to: (t as any).to });
              }}
              className="tap w-full text-left bg-card border rounded-2xl p-4 flex items-center gap-4 shadow-card hover:border-primary/40 transition"
            >
              <div className="size-12 rounded-xl flex items-center justify-center bg-primary text-primary-foreground">
                <Icon className="size-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </AppShell>
  );
}
