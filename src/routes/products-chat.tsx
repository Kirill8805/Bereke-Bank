import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2, Loader2, User as UserIcon, Sparkles, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { startProductsChat, sendProductsManagerMessage, clearProductsChat } from "@/lib/products-chat.functions";

export const Route = createFileRoute("/products-chat")({
  head: () => ({ meta: [{ title: "Тренажёр: Продукты — Bereke AI" }] }),
  component: ProductsChatPage,
});

type Msg = { id?: string; role: "bot" | "manager"; content: string; created_at?: string };
type StageScore = { score: number; comment: string };
type Report = {
  stages?: { contact?: StageScore; needs?: StageScore; presentation?: StageScore; objections?: StageScore; closing?: StageScore };
  extras?: { politeness?: number; rates?: number; numbers?: number; product?: number };
  final_score_5?: number;
  recommendations?: string[];
};
type Summary = { score: number; summary: string; strengths: string[]; weaknesses: string[]; report?: Report | null };
const BOT_NAME = "Алибек";
const KIND = "products_roleplay";

function ProductsChatPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const startFn = useServerFn(startProductsChat);
  const sendFn = useServerFn(sendProductsManagerMessage);
  const clearFn = useServerFn(clearProductsChat);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, summaryOpen]);

  async function boot() {
    setBooting(true);
    try {
      // Load most recent session (completed OR active) so chat & result persist after refresh
      const { data: existing } = await supabase
        .from("chat_sessions").select("*")
        .eq("kind", KIND)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (existing) {
        const { data: msgs } = await supabase
          .from("chat_messages").select("id, role, content, created_at")
          .eq("session_id", existing.id).order("created_at", { ascending: true });
        setSessionId(existing.id);
        setMessages((msgs ?? []) as Msg[]);
        setCompleted(!!existing.completed);

        if (existing.completed) {
          let text = String(existing.summary ?? "");
          let report: Report | null = null;
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && "text" in parsed) {
              text = String(parsed.text ?? "");
              report = (parsed.report ?? null) as Report | null;
            }
          } catch { /* legacy plain text */ }
          setSummary({
            score: Number(existing.score ?? 0),
            summary: text,
            strengths: (existing.strengths ?? []) as string[],
            weaknesses: (existing.weaknesses ?? []) as string[],
            report,
          });
        } else {
          setSummary(null);
        }
      } else {
        await startNew();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось запустить чат");
    } finally { setBooting(false); }
  }

  async function startNew() {
    const { sessionId: sid, greeting } = await startFn();
    setSessionId(sid);
    setMessages([{ role: "bot", content: greeting }]);
    setCompleted(false);
    setSummary(null);
    setSummaryOpen(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || !sessionId || sending || completed) return;
    setInput("");
    setMessages((p) => [...p, { role: "manager", content: text }]);
    setSending(true);
    try {
      const res = await sendFn({ data: { sessionId, text } });
      if (res.botMessage) {
        setMessages((p) => [...p, { role: "bot", content: res.botMessage }]);
      }
      if (res.finalized) {
        setCompleted(true);
        setSummary(res.summary as Summary);
        setSummaryOpen(true);
        toast.success(`Беседа завершена! Оценка: ${Number(res.summary.score).toFixed(1)}/5`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    } finally { setSending(false); }
  }

  async function resetAll() {
    if (!confirm("Полностью очистить переписку и начать заново?")) return;
    try {
      if (sessionId) await clearFn({ data: { sessionId } });
      setSessionId(null); setMessages([]); setSummary(null); setSummaryOpen(false); setCompleted(false);
      await startNew();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => navigate({ to: "/trainers" })} className="tap text-2xl">←</button>
          <h1 className="font-bold text-base">Тренажёр: Кредиты</h1>
          <div className="flex items-center gap-2">
            {completed && summary && !summaryOpen && (
              <button onClick={() => setSummaryOpen(true)} className="tap inline-flex items-center gap-1.5 bg-accent text-foreground rounded-md px-3 py-1.5 text-sm font-medium border">
                <BarChart3 className="size-3.5" /> Результат
              </button>
            )}
            <button onClick={resetAll} className="tap inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium">
              <Trash2 className="size-3.5" /> Начать заново
            </button>
          </div>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24 max-w-3xl w-full mx-auto">
        {booting && <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>}
        {messages.map((m, i) => <Bubble key={m.id ?? i} msg={m} />)}
        {sending && (
          <div className="flex items-end gap-2">
            <Avatar role="bot" />
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
              <span className="size-1.5 bg-foreground/40 rounded-full animate-bounce" />
              <span className="size-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:0.15s]" />
              <span className="size-1.5 bg-foreground/40 rounded-full animate-bounce [animation-delay:0.3s]" />
            </div>
          </div>
        )}
        {completed && (
          <div className="text-center text-xs text-muted-foreground py-3 italic">
            Диалог завершён. Откройте результат или нажмите «Начать заново», чтобы пройти ещё раз.
          </div>
        )}
      </div>

      {!completed && (
        <div className="sticky bottom-0 bg-background border-t safe-bottom">
          <div className="flex items-center gap-2 p-3 max-w-3xl mx-auto w-full">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Напишите как менеджер банка…"
              disabled={sending || booting}
              className="flex-1 h-11 px-4 bg-muted rounded-full text-[15px] outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button onClick={send} disabled={!input.trim() || sending} className="tap size-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40">
              {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </div>
        </div>
      )}

      {summary && summaryOpen && (
        <SummaryModal
          s={summary}
          onClose={() => setSummaryOpen(false)}
          onAgain={resetAll}
        />
      )}
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isBot = msg.role === "bot";
  return (
    <div className={`flex items-end gap-2 ${isBot ? "" : "flex-row-reverse"}`}>
      <Avatar role={msg.role} />
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${isBot ? "bg-muted rounded-bl-md text-foreground" : "bg-primary text-primary-foreground rounded-br-md"}`}>
        <p className={`text-[11px] font-semibold mb-0.5 ${isBot ? "text-muted-foreground" : "text-white/85"}`}>
          {isBot ? "Клиент" : "Вы"}
        </p>

        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "bot" | "manager" }) {
  return (
    <div className={`size-8 shrink-0 rounded-full flex items-center justify-center ${role === "bot" ? "bg-accent text-primary" : "bg-primary/15 text-primary"}`}>
      {role === "bot" ? <Sparkles className="size-4" /> : <UserIcon className="size-4" />}
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  contact: "Установление контакта",
  needs: "Выявление потребностей",
  presentation: "Презентация продукта",
  objections: "Работа с возражениями",
  closing: "Закрытие сделки",
};
const EXTRA_LABELS: Record<string, string> = {
  politeness: "Вежливость",
  rates: "Знание ставок",
  numbers: "Знание цифр и условий",
  product: "Знание продукта",
};

function SummaryModal({ s, onClose, onAgain }: { s: Summary; onClose: () => void; onAgain: () => void }) {
  const r = s.report ?? null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-6 animate-in fade-in">
      <div className="bg-card w-full max-w-[1200px] sm:w-[90vw] rounded-lg p-5 sm:p-8 max-h-[92vh] overflow-y-auto animate-in zoom-in-95">
        <div className="flex justify-between items-start mb-5">
          <h2 className="text-2xl sm:text-3xl font-bold">Оценка диалога</h2>
          <button onClick={onClose} className="tap p-1" aria-label="Закрыть"><X className="size-6" /></button>
        </div>

        <div className="flex flex-col sm:flex-row items-start gap-4 mb-6">
          <div className="size-24 sm:size-28 rounded-md gradient-primary text-primary-foreground flex flex-col items-center justify-center shrink-0">
            <span className="text-4xl font-bold leading-none">
              {r?.final_score_5 != null ? Number(r.final_score_5).toFixed(1) : Number(s.score ?? 0).toFixed(1)}
            </span>
            <span className="text-xs opacity-80 mt-1">из 5</span>
          </div>
          <p className="flex-1 text-base text-muted-foreground">{s.summary}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {r?.stages && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2 text-primary">Этапы продаж</p>
              <ul className="space-y-2">
                {Object.entries(r.stages).map(([k, v]) => v && (
                  <li key={k} className="text-sm bg-muted rounded-md px-3 py-2.5">
                    <div className="flex justify-between font-medium">
                      <span>{STAGE_LABELS[k] ?? k}</span>
                      <span>{v.score}/5</span>
                    </div>
                    {v.comment && <p className="text-xs text-muted-foreground mt-1">{v.comment}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r?.extras && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-2 text-primary">Дополнительные оценки</p>
              <ul className="grid grid-cols-2 gap-2">
                {Object.entries(r.extras).map(([k, v]) => (
                  <li key={k} className="text-sm bg-muted rounded-md px-3 py-2.5 flex justify-between">
                    <span className="text-xs">{EXTRA_LABELS[k] ?? k}</span>
                    <span className="font-semibold">{v}/5</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section title="Сильные стороны" color="success" items={s.strengths} />
          <Section title="Слабые стороны" color="destructive" items={s.weaknesses} />
          {r?.recommendations?.length ? (
            <div className="lg:col-span-2">
              <Section title="Рекомендации" color="info" items={r.recommendations} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7">
          <button onClick={onClose} className="tap rounded-md border py-3 text-sm font-semibold hover:bg-muted transition">
            Закрыть результат
          </button>
          <button onClick={onAgain} className="tap rounded-md bg-primary text-primary-foreground py-3 text-sm font-semibold hover:opacity-90 transition">
            Начать заново
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, items }: { title: string; color: "success" | "destructive" | "info"; items: string[] }) {
  const cls = color === "success" ? "text-success" : color === "destructive" ? "text-destructive" : "text-primary";
  const bullet = color === "success" ? "✓" : color === "destructive" ? "•" : "→";
  return (
    <div>
      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${cls}`}>{title}</p>
      <ul className="space-y-2">
        {items.map((t, i) => (
          <li key={i} className="text-sm bg-muted rounded-md px-3 py-2.5 flex gap-2">
            <span className={cls}>{bullet}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
