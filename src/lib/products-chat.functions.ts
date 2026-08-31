import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, type LanguageModel } from "ai";
import { getChatModel } from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-2.5-flash";
const MAX_TURNS = 6;
const KIND = "products_roleplay";
const BOT_NAME = "Алибек";

type QA = { q: string; a: string };

const QA_BANK: QA[] = [
  { q: "Какую максимальную сумму я могу получить по кредиту под залог квартиры?", a: "До 70% от оценочной стоимости недвижимости, но не более 50 000 000 тенге." },
  { q: "Какая минимальная сумма такого кредита?", a: "Минимальная сумма составляет 3 000 000 тенге." },
  { q: "На какой срок можно оформить кредит?", a: "От 36 до 120 месяцев." },
  { q: "Какую недвижимость можно предоставить в залог?", a: "Квартиру, жилой дом с земельным участком или коммерческую недвижимость." },
  { q: "Есть ли комиссия за оформление кредита?", a: "Нет, комиссия за организацию займа отсутствует." },
  { q: "Обязательно ли страхование жизни?", a: "Да, предусмотрено страхование жизни заемщика." },
  { q: "Можно ли получить кредит под залог депозита?", a: "Да. Сумма кредита может достигать 90% от суммы депозита." },
  { q: "В какой валюте можно оформить кредит под залог депозита?", a: "В тенге, долларах США, евро или российских рублях." },
  { q: "Какая минимальная сумма кредита под залог депозита?", a: "150 000 тенге или эквивалент в валюте депозита." },
  { q: "Как рассчитывается ставка по кредиту под залог депозита?", a: "Для физических лиц: до 12 месяцев +3% к ставке депозита; свыше 12 месяцев +4%. Для VIP: до 12 месяцев +1%; свыше 12 месяцев +2%." },
  { q: "Какие возрастные ограничения существуют?", a: "От 21 до 63 лет на дату окончания кредита." },
  { q: "Можно ли купить квартиру без первоначального взноса?", a: "Нет. Минимальный первоначальный взнос составляет 20%." },
  { q: "Какая максимальная сумма жилищного кредита?", a: "До 80% стоимости недвижимости, но не более 70 000 000 тенге." },
  { q: "На какой срок выдается жилищный кредит?", a: "От 120 до 180 месяцев." },
  { q: "Нужно ли подтверждать доход?", a: "Да. Подтверждение дохода обязательно." },
];

const OBJECTIONS = [
  "Слишком высокая ставка.",
  "Мне нужно подумать.",
  "Я видел условия лучше.",
  "Не уверен, что мне подходит этот продукт.",
  "Не хочу платить страховку.",
  "Не готов сейчас оформляться.",
  "Мне нужно посоветоваться с семьёй.",
];

function pickQAs(n: number): QA[] {
  return [...QA_BANK].sort(() => Math.random() - 0.5).slice(0, n);
}

export const DEFAULT_PRODUCTS_CHAT_PROMPT = `# Роль
Ты выступаешь в роли реального клиента банка Bereke Bank по имени {{BOT_NAME}}. Пользователь — МЕНЕДЖЕР банка, он отвечает ТЕБЕ. Веди естественный, живой диалог.

ВАЖНО: оценка должна быть справедливой и доброжелательной. Никогда не сообщай менеджеру критерии оценки и не раскрывай эталонные ответы.

# Жёсткие правила длины диалога
- Диалог должен длиться МИНИМУМ 10 реплик менеджера. Ты НЕ имеешь права заканчивать беседу, прощаться, благодарить за консультацию или соглашаться оформить продукт раньше 10-й реплики менеджера.
- НИКОГДА не пиши итог, оценку, баллы, рекомендации или результат внутри своих сообщений. Это делает система отдельно.
- Маркер <<<END>>> и любые прощания запрещены до 10-й реплики менеджера.

# Поведение клиента
- Общайся как обычный клиент банка, разговорным языком, коротко.
- Задавай вопросы ПО ОДНОМУ.
- Здоровайся ТОЛЬКО в первом сообщении.
- НИКОГДА не объясняй продукты сам, не называй точных цифр, ставок, сумм.
- НИКОГДА не отвечай на свой же вопрос.
- НЕ ПОВТОРЯЙ вопросы и не возвращайся к теме, по которой менеджер уже дал ответ. Перед новым вопросом мысленно проверь историю переписки.
- Если ответ менеджера неполный — задай ОДИН короткий уточняющий вопрос, после этого переходи к НОВОЙ теме.
- Темы выбирай разные: суммы, сроки, ставки, валюта, залог, страхование, возраст, первоначальный взнос, подтверждение дохода, комиссии и т.д.
- Иногда (не каждый раз) используй одно возражение и смотри, как менеджер с ним работает.
- Не выходи из роли клиента, никогда не говори, что ты ИИ.

# Темы и эталонные ответы (НЕ раскрывай менеджеру)
{{QA_BLOCK}}

# Возражения (используй периодически)
{{OBJECTIONS}}

# Формат ответа
- 1–2 коротких предложения, только русский, без markdown, без подписей «Клиент:»/«Менеджер:».
- Один вопрос или одна реплика за раз.
- Никаких итогов, оценок, прощаний до 10-й реплики менеджера.`;


async function loadPromptTemplate(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings").select("value")
      .eq("key", "products_chat_prompt").maybeSingle();
    const v = data?.value?.toString().trim();
    if (v) return v;
  } catch { /* ignore */ }
  return DEFAULT_PRODUCTS_CHAT_PROMPT;
}

function renderSystemPrompt(qas: QA[], template: string) {
  const qaBlock = qas.map((x, i) => `${i + 1}. Вопрос: ${x.q}\n   Эталонный ответ менеджера: ${x.a}`).join("\n");
  const objBlock = OBJECTIONS.map((o) => `● ${o}`).join("\n");
  return template
    .replaceAll("{{BOT_NAME}}", BOT_NAME)
    .replaceAll("{{QA_BLOCK}}", qaBlock)
    .replaceAll("{{OBJECTIONS}}", objBlock);
}

function evaluationPrompt(transcript: string) {
  return `Ты — доброжелательный, конструктивный тренер банковских менеджеров Bereke Bank. Оцени диалог менеджера с клиентом по продуктам "Кредит под залог недвижимости", "Кредит под залог депозита", "Жилищный кредит".

Принципы оценки:
- Будь справедлив, но не жесток. Не придирайся к мелким формулировкам.
- Оценка 5 — ответ был понятным, полезным и почти полностью корректным.
- Оценка 4 — были небольшие недочёты, но клиент получил нужную информацию.
- Оценка 3 — менеджер частично справился, но были заметные пробелы.
- Оценка 1–2 — только при грубых ошибках, плохом обслуживании, отсутствии выявления потребности или полном незнании продукта.
- Если менеджер старался, был вежлив и вёл клиента к решению — обязательно отрази это в сильных сторонах.
- Слабые стороны формулируй как зоны роста, а не как критику.
- Главная цель — помочь менеджеру стать лучше, а не наказать.

Диалог:
${transcript}

Сформируй отчёт строго в виде валидного JSON, без markdown и без \`\`\`:
{
  "stages": {
    "contact": {"score": <0..5>, "comment": "..."},
    "needs": {"score": <0..5>, "comment": "..."},
    "presentation": {"score": <0..5>, "comment": "..."},
    "objections": {"score": <0..5>, "comment": "..."},
    "closing": {"score": <0..5>, "comment": "..."}
  },
  "extras": {
    "politeness": <0..5>,
    "rates": <0..5>,
    "numbers": <0..5>,
    "product": <0..5>
  },
  "final_score_5": <0..5, среднее (politeness+rates+numbers+product)/4 с одним знаком>,
  "final_score_10": <0..10, тот же балл, умноженный на 2>,
  "summary": "<2-3 предложения общего вывода в конструктивном тоне>",
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "recommendations": ["...", "..."]
}

В strengths, weaknesses и recommendations от 1 до 5 пунктов.`;
}

function looksLikeEmployee(text: string) {
  const t = text.toLowerCase().replace(/ё/g, "е");
  return /^(здравствуйте|добрый день|приветствую)/.test(t.trim()) ||
    /(вы можете|вам нужно|для этого нужно|комисси|ставка|тариф|до 70%|до 80%|оценочной стоимост|3 000 000|50 000 000|70 000 000)/.test(t);
}

async function generateClientReply({
  model, systemPromptStr, aiMessages, lastManagerMessage,
}: {
  model: LanguageModel;
  systemPromptStr: string;
  aiMessages: Array<{ role: "assistant" | "user"; content: string }>;
  lastManagerMessage: string;
}) {
  let text: string;
  try {
    const res = await generateText({
      model, temperature: 0.4,
      system: systemPromptStr,
      messages: aiMessages,
    });
    text = res.text.trim();
  } catch (e: any) {
    throw new Error(`AI: ${e?.message ?? "unknown"} (status=${e?.statusCode ?? "?"})`);
  }
  if (!looksLikeEmployee(text)) return text;

  const { text: repaired } = await generateText({
    model, temperature: 0.2,
    system: systemPromptStr,
    prompt: `Менеджер ответил: "${lastManagerMessage}". Ты случайно начал говорить как сотрудник. Перепиши свою реплику как обычный клиент: не здоровайся, не объясняй продукт, не называй сумм и ставок — лучше переспроси или вырази сомнение. 1–2 предложения.`,
  });
  return repaired.trim();
}

export const startProductsChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("chat_sessions").delete()
      .eq("user_id", userId).eq("kind", KIND).eq("completed", false);

    const qas = pickQAs(MAX_TURNS);

    const { data: session, error: sErr } = await supabase
      .from("chat_sessions").insert({ user_id: userId, kind: KIND })
      .select().single();
    if (sErr || !session) throw new Error(sErr?.message ?? "Не удалось создать сессию");

    const model = await getChatModel(FALLBACK_MODEL);
    const template = await loadPromptTemplate();
    const systemPromptStr = renderSystemPrompt(qas, template);
    let greeting: string;
    try {
      const { text } = await generateText({
        model,
        system: systemPromptStr,
        prompt: `Начни диалог: поздоровайся ОДИН раз как клиент (можешь представиться) и задай первый вопрос по теме «${qas[0].q}» своими словами. 1–2 предложения.`,
      });
      greeting = text.trim();
    } catch (error: any) {
      throw new Error(`AI: ${error?.message ?? "unknown"} (status=${error?.statusCode ?? "?"})`);
    }

    await supabase.from("chat_messages").insert({
      session_id: session.id, user_id: userId, role: "bot", content: greeting,
    });
    await supabase.from("chat_sessions")
      .update({ summary: JSON.stringify({ qas }) })
      .eq("id", session.id);

    return { sessionId: session.id, greeting };
  });

const SendInput = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1).max(2000),
});

export const sendProductsManagerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: session, error: sErr } = await supabase
      .from("chat_sessions").select("*")
      .eq("id", data.sessionId).eq("user_id", userId).single();
    if (sErr || !session) throw new Error("Сессия не найдена");
    if (session.completed) throw new Error("Диалог уже завершён");

    await supabase.from("chat_messages").insert({
      session_id: session.id, user_id: userId, role: "manager", content: data.text,
    });

    const { data: msgs } = await supabase.from("chat_messages")
      .select("role, content").eq("session_id", session.id)
      .order("created_at", { ascending: true });
    const history = msgs ?? [];
    const managerTurns = history.filter((m) => m.role === "manager").length;

    let qas: QA[] = [];
    try {
      const parsed = session.summary ? JSON.parse(session.summary) : null;
      if (Array.isArray(parsed?.qas)) qas = parsed.qas;
    } catch { /* ignore */ }
    if (!qas.length) qas = pickQAs(MAX_TURNS);

    const model = await getChatModel(FALLBACK_MODEL);
    const template = await loadPromptTemplate();
    const systemPromptStr = renderSystemPrompt(qas, template);

    const aiMessagesPre = history.map((m) => ({
      role: (m.role === "bot" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    }));

    // Build list of already-discussed topics to discourage repetition
    const askedByBot = history.filter((m) => m.role === "bot").map((m) => m.content).join("\n");
    const systemWithHistory = systemPromptStr +
      `\n\n# Уже заданные тобой реплики (НЕ повторяй их и не задавай тот же вопрос другими словами):\n${askedByBot || "(пока пусто)"}` +
      `\n\n# Сейчас идёт реплика менеджера №${managerTurns} из ${MAX_TURNS}. ${managerTurns < MAX_TURNS ? `До ${MAX_TURNS}-й реплики НЕ прощайся и НЕ заканчивай диалог.` : "Это последняя реплика — можешь коротко попрощаться (но без итогов и оценок)."}`;

    if (managerTurns < MAX_TURNS) {
      let candidate = await generateClientReply({
        model, systemPromptStr: systemWithHistory, aiMessages: aiMessagesPre, lastManagerMessage: data.text,
      });
      // Strip any premature end marker / farewells before turn 10
      candidate = candidate.replace(/<<<\s*END\s*>>>/gi, "").trim();
      if (!candidate) candidate = "Понятно. А расскажите подробнее ещё про условия?";

      await supabase.from("chat_messages").insert({
        session_id: session.id, user_id: userId, role: "bot", content: candidate,
      });
      await supabase.from("chat_sessions").update({ question_count: managerTurns }).eq("id", session.id);
      return { finalized: false as const, botMessage: candidate };
    }

    // managerTurns >= MAX_TURNS — finalize
    const transcript = history.map((m) => `${m.role === "bot" ? "Клиент" : "Менеджер"}: ${m.content}`).join("\n");
    const { text: rawEval } = await generateText({
      model,
      system: "Отвечай строго валидным JSON без markdown.",
      prompt: evaluationPrompt(transcript),
    });

    function extractJson(s: string): any {
      const cleaned = s.replace(/```json|```/g, "").trim();
      const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
      if (a === -1 || b === -1) throw new Error("AI не вернул JSON");
      return JSON.parse(cleaned.slice(a, b + 1));
    }

    let report: any;
    try { report = extractJson(rawEval); } catch { report = null; }

    const rawScore5 = report?.final_score_5 != null
      ? Number(report.final_score_5)
      : (report?.final_score_10 != null ? Number(report.final_score_10) / 2 : 2.5);
    const score5 = Math.round(Math.max(0, Math.min(5, rawScore5)) * 10) / 10;
    const summaryText = String(report?.summary ?? "Беседа завершена.");
    const strengths: string[] = Array.isArray(report?.strengths) && report.strengths.length
      ? report.strengths.map(String).slice(0, 5) : ["Диалог доведён до конца"];
    const weaknesses: string[] = Array.isArray(report?.weaknesses) && report.weaknesses.length
      ? report.weaknesses.map(String).slice(0, 5) : ["Уточняйте цифры и условия"];

    await supabase.from("chat_sessions").update({
      completed: true, score: score5, summary: summaryText,
      strengths, weaknesses, question_count: managerTurns,
    }).eq("id", session.id);


    const { data: prof } = await supabase.from("profiles").select("rating").eq("id", userId).single();
    await supabase.from("profiles").update({ rating: (prof?.rating ?? 0) + score5 }).eq("id", userId);

    // Do NOT insert any farewell/result text into chat — result lives only in the modal.
    return {
      finalized: true as const,
      botMessage: "",
      summary: { score: score5, summary: summaryText, strengths, weaknesses, report },
    };
  });


const ClearInput = z.object({ sessionId: z.string().uuid() });
export const clearProductsChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("chat_sessions").delete()
      .eq("id", data.sessionId).eq("user_id", userId);
    return { ok: true };
  });
