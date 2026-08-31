import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { startCollateralTest, submitCollateralTest, clearCollateralTest } from "@/lib/collateral-test.functions";

export const Route = createFileRoute("/collateral-test")({
  head: () => ({ meta: [{ title: "Тест: Залоги — Bereke AI" }] }),
  component: CollateralTestPage,
});

type Summary = { score: number; summary: string; strengths: string[]; weaknesses: string[] };

function CollateralTestPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [booting, setBooting] = useState(true);
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const startFn = useServerFn(startCollateralTest);
  const submitFn = useServerFn(submitCollateralTest);
  const clearFn = useServerFn(clearCollateralTest);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function boot() {
    setBooting(true);
    try {
      const { sessionId: sid, questions: qs } = await startFn();
      setSessionId(sid); setQuestions(qs); setAnswer(""); setSummary(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось запустить тест");
    } finally { setBooting(false); }
  }

  async function onSubmit() {
    if (!sessionId || sending) return;
    const text = answer.trim();
    if (!text) { toast.error("Напишите ответ"); return; }
    setSending(true);
    try {
      const res = await submitFn({ data: { sessionId, answer: text } });
      setSummary(res.summary);
      toast.success(`Оценка: ${Number(res.summary.score).toFixed(1)}/5`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    } finally { setSending(false); }
  }

  async function reset() {
    if (sessionId) { try { await clearFn({ data: { sessionId } }); } catch { /* ignore */ } }
    setSessionId(null); await boot();
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center px-4 h-14">
          <button onClick={() => navigate({ to: "/tests" })} className="tap text-primary p-1 -ml-1" aria-label="Назад">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="flex-1 text-center font-semibold text-base pr-6">Тест: Залоги</h1>
        </div>
      </header>

      <main className="flex-1 px-5 py-5 pb-28 max-w-2xl w-full mx-auto">
        {booting ? (
          <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <section>
              <h2 className="text-2xl font-bold mb-3">Вопросы</h2>
              <ol className="space-y-2 text-[15px] text-muted-foreground leading-relaxed">
                {questions.map((q, i) => (
                  <li key={i}>{i + 1}. {q}</li>
                ))}
              </ol>
            </section>

            <div className="my-6 h-px bg-border" />

            <section>
              <h2 className="text-2xl font-bold mb-3">Ваш ответ</h2>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={sending || !!summary}
                rows={8}
                placeholder="Ответьте на все вопросы в свободной форме…"
                className="w-full resize-y bg-muted/70 rounded-md p-4 text-[15px] outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
              />
              <div className="mt-4">
                <button
                  onClick={onSubmit}
                  disabled={sending || !answer.trim() || !!summary}
                  className="tap inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
                >
                  {sending && <Loader2 className="size-4 animate-spin" />}
                  Отправить
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {summary && <SummaryModal s={summary} onClose={() => navigate({ to: "/profile" })} onAgain={reset} />}
    </div>
  );
}

function SummaryModal({ s, onClose, onAgain }: { s: Summary; onClose: () => void; onAgain: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center animate-in fade-in">
      <div className="bg-card w-full sm:max-w-md rounded-t-xl sm:rounded-lg p-5 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom">
        <div className="flex justify-between items-start mb-3">
          <h2 className="text-xl font-bold">Итог теста</h2>
          <button onClick={onClose} className="tap p-1" aria-label="Закрыть"><X className="size-5" /></button>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="size-16 rounded-md gradient-primary text-primary-foreground flex flex-col items-center justify-center">
            <span className="text-2xl font-bold leading-none">{Number(s.score).toFixed(1)}</span>
            <span className="text-[10px] opacity-80">из 5</span>
          </div>
          <p className="flex-1 text-sm text-muted-foreground">{s.summary}</p>
        </div>
        <Section title="Сильные стороны" color="success" items={s.strengths} />
        <Section title="Что подучить" color="destructive" items={s.weaknesses} />
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button onClick={onAgain} className="tap rounded-md border py-3 text-sm font-semibold">Ещё раз</button>
          <button onClick={onClose} className="tap rounded-md bg-primary text-primary-foreground py-3 text-sm font-semibold">В профиль</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, items }: { title: string; color: "success" | "destructive"; items: string[] }) {
  return (
    <div className="mt-3">
      <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${color === "success" ? "text-success" : "text-destructive"}`}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="text-sm bg-muted rounded-md px-3 py-2 flex gap-2">
            <span className={color === "success" ? "text-success" : "text-destructive"}>{color === "success" ? "✓" : "•"}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
