import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { DEPARTMENTS, POSITIONS } from "@/lib/constants";
import { getRatings } from "@/lib/rating.functions";

export const Route = createFileRoute("/rating")({
  head: () => ({ meta: [{ title: "Рейтинг — Bereke AI" }] }),
  component: Rating,
});

type Row = {
  id: string;
  full_name: string;
  photo_url: string | null;
  position: string | null;
  department: string | null;
  rating: number;
  avgScore: number | null;
};

function Rating() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [depFilter, setDepFilter] = useState<string[]>([]);
  const [posFilter, setPosFilter] = useState<string[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    void (async () => {
      try {
        const data = await getRatings();
        setRows(data as Row[]);
      } catch (e) {
        console.error("getRatings failed", e);
      }
    })();
  }, [user, loading, navigate]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (q && !r.full_name.toLowerCase().includes(q.toLowerCase())) return false;
    if (depFilter.length && !depFilter.includes(r.department ?? "")) return false;
    if (posFilter.length && !posFilter.includes(r.position ?? "")) return false;
    return true;
  }).sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1)), [rows, q, depFilter, posFilter]);

  return (
    <AppShell title="">
      <h1 className="text-2xl font-bold mb-4">Рейтинг сотрудников</h1>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск"
            className="w-full h-11 pl-10 pr-3 bg-muted rounded-xl outline-none text-sm focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <button onClick={() => setShowFilter(true)} className={`tap size-11 rounded-xl flex items-center justify-center border ${depFilter.length || posFilter.length ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
          <SlidersHorizontal className="size-5" />
        </button>
      </div>

      <ul className="space-y-2.5">
        {filtered.map((r) => (
          <li key={r.id} className="bg-card border rounded-2xl p-3 flex items-center gap-3 shadow-soft tap hover:border-primary/40 transition">
            {r.photo_url ? (
              <img src={r.photo_url} className="size-14 rounded-xl object-cover" />
            ) : (
              <div className="size-14 rounded-xl bg-muted" />
            )}
            <div className="flex-1 min-w-0">
              {r.position && <p className="text-[10px] font-bold uppercase text-primary tracking-wide truncate">{r.position}</p>}
              <p className="font-semibold truncate">{r.full_name}</p>
              <p className="text-sm text-muted-foreground">Средняя оценка: <span className="text-foreground font-medium">{r.avgScore != null ? r.avgScore.toFixed(1) : "—"}</span></p>
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-center text-muted-foreground text-sm py-10">Никого не найдено</li>
        )}
      </ul>

      {showFilter && (
        <div className="fixed inset-0 z-50 flex items-end animate-in fade-in" onClick={() => setShowFilter(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={(e) => e.stopPropagation()} className="relative w-full bg-card rounded-t-3xl p-5 pb-7 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between mb-4">
              <span className="w-8" />
              <h2 className="font-bold text-lg">Фильтр</h2>
              <button onClick={() => setShowFilter(false)} className="tap size-8 rounded-full bg-muted flex items-center justify-center"><X className="size-4" /></button>
            </div>

            <FilterGroup title="Отдел" options={DEPARTMENTS} selected={depFilter} onChange={setDepFilter} />
            <FilterGroup title="Должность" options={POSITIONS} selected={posFilter} onChange={setPosFilter} />

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button onClick={() => { setDepFilter([]); setPosFilter([]); }} className="tap rounded-xl border py-3 font-semibold text-sm">Очистить все</button>
              <button onClick={() => setShowFilter(false)} className="tap rounded-xl bg-primary text-primary-foreground py-3 font-semibold text-sm">Готово</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function FilterGroup({ title, options, selected, onChange }: { title: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(true);
  function toggle(o: string) {
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  }
  return (
    <div className="border-b py-3">
      <button onClick={() => setOpen((p) => !p)} className="w-full flex items-center justify-between font-semibold">
        <span>{title}</span>
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {options.map((o) => (
            <li key={o}>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm">{o}</span>
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="size-5 accent-primary" />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
