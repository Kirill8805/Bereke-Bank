import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2, Loader2, User as UserIcon, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { startLimitsChat, sendLimitsManagerMessage, clearLimitsChat } from "@/lib/limits-chat.functions";

export const Route = createFileRoute("/limits-chat")({
  head: () => ({ meta: [{ title: "Тренажёр: Лимиты — Bereke AI" }] }),
  component: LimitsChatPage,
});

type Msg = { id?: string; role: "bot" | "manager"; content: string; created_at?: string };
type Summary = { score: number; summary: string; strengths: string[]; weaknesses: string[] };
const BOT_NAME = "Айдар";
const KIND = "limits_roleplay";

function LimitsChatPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const startFn = useServerFn(startLimitsChat);
  const sendFn = useServerFn(sendLimitsManagerMessage);
  const clearFn = useServerFn(clearLimitsChat);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, summary]);

  async function boot() {
    setBooting(true);
    try {
      const { data: existing } = await supabase
        .from("chat_sessions").select("*")
        .eq("kind", KIND).eq("completed", false)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (existing) {
        const { data: msgs } = await supabase
          .from("chat_messages").select("id, role, content, created_at")
          .eq("session_id", existing.id).order("created_at", { ascending: true });
        setSessionId(existing.id);
        setMessages((msgs ?? []) as Msg[]);
      } else {
        const { sessionId: sid, greeting } = await startFn();
        setSessionId(sid);
        setMessages([{ role: "bot", content: greeting }]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось запустить чат");
    } finally { setBooting(false); }
  }

  async function send() {
    const text = input.trim();
    if (!text || !sessionId || sending) return;
    setInput("");
    setMessages((p) => [...p, { role: "manager", content: text }]);
    setSending(true);
    try {
      const res = await sendFn({ data: { sessionId, text } });
      setMessages((p) => [...p, { role: "bot", content: res.botMessage }]);
      if (res.finalized) {
        setSummary(res.summary);
        toast.success(`Беседа завершена! Оценка: ${Number(res.summary.score).toFixed(1)}/5`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    } finally { setSending(false); }
  }

  async function reset() {
    if (!sessionId) return;
    if (!confirm("Очистить текущий диалог?")) return;
    try {
      await clearFn({ data: { sessionId } });
      setSessionId(null); setMessages([]); setSummary(null);
      await boot();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => navigate({ to: "/trainers" })} className="tap text-2xl">←</button>
          <h1 className="font-bold text-lg">Тренажёр: Лимиты</h1>
          <button onClick={reset} className="tap inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-3 py-1.5 text-sm font-medium">
            <Trash2 className="size-3.5" /> Очистить
          </button>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">
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
      </div>

      {!summary && (
        <div className="sticky bottom-0 bg-background border-t safe-bottom">
          <div className="flex items-center gap-2 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Напишите что-нибудь..."
              disabled={sending || booting}
              className="flex-1 h-11 px-4 bg-muted rounded-full text-[15px] outline-none focus:ring-2 focus:ring-ring/30"
            />
            <button onClick={send} disabled={!input.trim() || sending} className="tap size-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40">
              {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </div>
        </div>
      )}

      {summary && <SummaryModal s={summary} onClose={() => navigate({ to: "/profile" })} onAgain={reset} />}
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
          {isBot ? BOT_NAME : "Вы"}
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

function SummaryModal({ s, onClose, onAgain }: { s: Summary; onClose: () => void; onAgain: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center animate-in fade-in">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom">
        <div className="flex justify-between items-start mb-3">
          <h2 className="text-xl font-bold">Итог беседы</h2>
          <button onClick={onClose} className="tap p-1"><X className="size-5" /></button>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="size-16 rounded-2xl gradient-primary text-primary-foreground flex flex-col items-center justify-center">
            <span className="text-2xl font-bold leading-none">{Number(s.score).toFixed(1)}</span>
            <span className="text-[10px] opacity-80">из 5</span>
          </div>
          <p className="flex-1 text-sm text-muted-foreground">{s.summary}</p>
        </div>
        <Section title="Сильные стороны" color="success" items={s.strengths} />
        <Section title="Слабые стороны" color="destructive" items={s.weaknesses} />
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button onClick={onAgain} className="tap rounded-xl border py-3 text-sm font-semibold">Ещё раз</button>
          <button onClick={onClose} className="tap rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold">В профиль</button>
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
          <li key={i} className="text-sm bg-muted rounded-lg px-3 py-2 flex gap-2">
            <span className={color === "success" ? "text-success" : "text-destructive"}>{color === "success" ? "✓" : "•"}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
