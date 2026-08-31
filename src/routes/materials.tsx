import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ArrowRight, FileText, Download } from "lucide-react";

export const Route = createFileRoute("/materials")({
  head: () => ({ meta: [{ title: "Обучающие материалы — Bereke AI" }] }),
  component: Materials,
});

type Material = { title: string; href: string; filename: string; bg: string; preview: "map" | "doc" };

const MATERIALS: Material[] = [
  { title: "Карта возможностей", href: "/materials/limity-po-perevodam.docx", filename: "Karta-vozmozhnostey.docx", bg: "from-emerald-300 to-emerald-500", preview: "map" },
  { title: "Работа с возражениями", href: "/materials/limity-po-perevodam.docx", filename: "Rabota-s-vozrazheniyami.docx", bg: "from-slate-200 to-slate-400", preview: "doc" },
  { title: "Лимиты по переводам", href: "/materials/limity-po-perevodam.docx", filename: "Limity-po-perevodam.docx", bg: "from-sky-200 to-sky-400", preview: "doc" },
];

function Materials() {
  return (
    <AppShell title="">
      <h1 className="text-2xl font-bold mb-5">Обучающие материалы</h1>
      <div className="space-y-5">
        {MATERIALS.map((m) => (
          <article key={m.title} className="space-y-2">
            <a
              href={m.href}
              download={m.filename}
              className={`tap block aspect-video rounded-2xl overflow-hidden bg-gradient-to-br ${m.bg} relative shadow-card hover:shadow-lg transition`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                {m.preview === "map" ? <MapPreview /> : <DocPreview title={m.title} />}
              </div>
              <div className="absolute top-3 right-3 size-9 rounded-full bg-white/90 flex items-center justify-center">
                <Download className="size-4 text-primary" />
              </div>
            </a>
            <a href={m.href} download={m.filename} className="tap flex items-center justify-between rounded-xl px-1 py-2 group">
              <span className="font-medium">{m.title}</span>
              <span className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition">
                <ArrowRight className="size-4" />
              </span>
            </a>
          </article>
        ))}
      </div>
    </AppShell>
  );
}

function MapPreview() {
  return (
    <div className="text-center text-white drop-shadow">
      <p className="text-xs font-bold uppercase tracking-widest opacity-90">Bereke Bank</p>
      <p className="text-lg font-bold mt-1">Карта возможностей</p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-[200px]">
        {["Кредиты", "Депозиты", "Карты", "Переводы", "Платежи"].map((t) => (
          <span key={t} className="text-[10px] font-semibold bg-primary text-primary-foreground rounded px-2 py-1">{t}</span>
        ))}
      </div>
    </div>
  );
}

function DocPreview({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-lg shadow-lg px-5 py-6 max-w-[70%] border-l-4 border-success">
      <FileText className="size-5 text-success mb-2" />
      <p className="text-sm font-semibold leading-tight">{title}</p>
      <p className="text-[10px] text-muted-foreground mt-3">Филиал г. Павлодар · 2026 г.</p>
    </div>
  );
}
