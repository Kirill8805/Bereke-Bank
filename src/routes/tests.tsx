import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/tests")({
  head: () => ({ meta: [{ title: "Тестирование с ИИ — Bereke AI" }] }),
  component: Tests,
});

const TESTS = [
  {
    id: "products",
    icon: FileText,
    title: "Кредиты под залог и жилищный кредит",
    desc: "Условия по залогу квартиры, депозита и ЖК",
    active: true,
    to: "/products-test" as const,
  },
];

function Tests() {
  const navigate = useNavigate();
  return (
    <AppShell title="Тестирование с ИИ" back="/">
      <p className="text-sm text-muted-foreground mb-4">Проверьте свои знания продуктов Bereke Bank</p>
      <div className="space-y-3">
        {TESTS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => navigate({ to: t.to })}
              className="tap w-full text-left bg-card border rounded-lg p-4 flex items-center gap-4 shadow-card hover:border-primary/40 transition"
            >
              <div className="size-12 rounded-md flex items-center justify-center bg-primary text-primary-foreground">
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
