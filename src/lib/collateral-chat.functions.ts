import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, type LanguageModel } from "ai";
import { getChatModel } from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-2.5-flash";
const MAX_TURNS = 5;
const KIND = "collateral_roleplay";
const BOT_NAME = "Ержан";

const COLLATERAL_QUESTIONS = [
  "Здравствуйте, хочу взять кредит под залог квартиры. Какая ставка и сумма?",
  "У меня квартира 1955 года постройки, подойдёт ли она в залог?",
  "Хочу заложить дом из самана в Шымкенте. Это возможно?",
  "У меня деревянный дом без отделки. Можно ли его взять в залог?",
  "Какой максимальный срок кредита и сумма по залоговому кредиту?",
  "У меня квартира 18 кв.м без централизованной канализации, возьмёте в залог?",
  "Какой LTV (коэффициент займа к стоимости) применяется по квартирам?",
  "Хочу заложить коммерческое помещение в подвале без отделки, возможно?",
  "У меня жилой дом 60 кв.м в 40 км от города, подойдёт?",
  "Можно ли взять кредит под залог квартиры третьего лица?",
  "У меня в квартире перенесли санузел в жилую комнату, это нормально?",
  "Нужно ли страхование и есть ли комиссия за организацию займа?",
];

function pickQuestions(n: number): string[] {
  const shuffled = [...COLLATERAL_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function systemPrompt(questions: string[]) {
  return `Ты КЛИЕНТ банка Bereke Bank по имени ${BOT_NAME}. Обычный человек. Пользователь — МЕНЕДЖЕР банка, он отвечает ТЕБЕ. Тема консультации — ЗАЛОГОВЫЙ КРЕДИТ и требования к недвижимости в залог.

КРИТИЧЕСКИ ВАЖНО:
- Здороваешься ТОЛЬКО в самом первом сообщении. Дальше не здоровайся и не представляйся.
- НИКОГДА не объясняй условия сам. Ты не знаешь параметров — ты пришёл узнать.
- НИКОГДА не отвечай на свой же вопрос. Если менеджер ответил коротко/непонятно — переспроси как клиент: «а почему?», «а какой максимум?», «а что подойдёт?».
- Не называй точные LTV, ставки, площади, годы — ты этого не знаешь.

ТЫ ТОЛЬКО:
- задаёшь вопросы от первого лица («а можно...?», «а у меня квартира...?», «а если дом...?»);
- реагируешь коротко на ответ менеджера;
- если ответ непонятный — удивляешься и уточняешь.

ТЕМЫ для вопросов (задавай СВОИМИ словами, по одной за раз):
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

ФОРМАТ: 1–3 предложения, только русский, без markdown, без подписей. Никогда не говори, что ты ИИ.`;
}

function looksLikeEmployeeReply(text: string) {
  const normalized = text.toLowerCase().replace(/ё/g, "е").trim();
  const employeePatterns = [
    /вы можете/, /для этого нужно/, /вам необходимо/, /вам нужно/,
    /ставка составля/, /ltv/, /процентная ставка/, /от 22/, /50 000 000/,
    /не ранее 19/, /не ранее 20/,
  ];
  const forbiddenGreeting = /^(здравствуйте|добрый день|приветствую)/.test(normalized);
  return forbiddenGreeting || employeePatterns.some((p) => p.test(normalized));
}

async function generateClientReply({
  model, questions, aiMessages, lastManagerMessage,
}: {
  model: LanguageModel;
  questions: string[];
  aiMessages: Array<{ role: "assistant" | "user"; content: string }>;
  lastManagerMessage: string;
}) {
  let text: string;
  try {
    const res = await generateText({
      model, temperature: 0.2,
      system: systemPrompt(questions) +
        `\n\nДОПОЛНИТЕЛЬНО: если менеджер ответил странно/коротко — НЕ объясняй продукт. Уточни как клиент.`,
      messages: aiMessages,
    });
    text = res.text;
  } catch (e: any) {
    console.error("[collateral generateClientReply] AI error:", e?.message, e?.statusCode);
    throw new Error(`AI: ${e?.message ?? "unknown"} (status=${e?.statusCode ?? "?"})`);
  }

  const firstAttempt = text.trim();
  if (!looksLikeEmployeeReply(firstAttempt)) return firstAttempt;

  const { text: repaired } = await generateText({
    model, temperature: 0.1,
    system: systemPrompt(questions),
    prompt: `Менеджер ответил: "${lastManagerMessage}". Ты случайно начал говорить как сотрудник. Перепиши свою реплику как обычный клиент: не здоровайся, не объясняй термины, не называй точные цифры — лучше переспроси. 1–2 предложения.`,
  });
  return repaired.trim();
}

export const startCollateralChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    await supabase.from("chat_sessions").delete()
      .eq("user_id", userId).eq("kind", KIND).eq("completed", false);

    const questions = pickQuestions(MAX_TURNS);

    const { data: session, error: sErr } = await supabase
      .from("chat_sessions")
      .insert({ user_id: userId, kind: KIND })
      .select().single();
    if (sErr || !session) throw new Error(sErr?.message ?? "Не удалось создать сессию");

    const model = await getChatModel(FALLBACK_MODEL);

    let greeting: string;
    try {
      const { text } = await generateText({
        model,
        system: systemPrompt(questions),
        prompt: `Начни диалог: поздоровайся ОДИН раз как клиент и задай первый вопрос по теме «${questions[0]}». 1–2 предложения.`,
      });
      greeting = text.trim();
    } catch (error: any) {
      throw new Error(`AI: ${error?.message ?? "unknown"} (status=${error?.statusCode ?? "?"})`);
    }

    await supabase.from("chat_messages").insert({
      session_id: session.id, user_id: userId, role: "bot", content: greeting,
    });
    await supabase.from("chat_sessions")
      .update({ summary: JSON.stringify({ questions }) })
      .eq("id", session.id);

    return { sessionId: session.id, greeting };
  });

const SendInput = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1).max(2000),
});

export const sendCollateralManagerMessage = createServerFn({ method: "POST" })
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

    let questions: string[] = [];
    try {
      const parsed = session.summary ? JSON.parse(session.summary) : null;
      if (parsed?.questions) questions = parsed.questions;
    } catch { /* ignore */ }
    if (!questions.length) questions = pickQuestions(MAX_TURNS);

    const model = await getChatModel(FALLBACK_MODEL);

    if (managerTurns >= MAX_TURNS) {
      const transcript = history.map((m) => `${m.role === "bot" ? "Клиент" : "Менеджер"}: ${m.content}`).join("\n");
      const { text: rawEval } = await generateText({
        model,
        system: `Ты строгий тренер для банковских менеджеров Bereke Bank по теме "Залоги и требования к недвижимости". Оцени, насколько менеджер правильно назвал условия залогового кредитования, требования к объектам и LTV. Отвечай ТОЛЬКО валидным JSON.`,
        prompt: `Диалог:\n\n${transcript}\n\nВерни строго JSON:\n{"score": <0..5>, "summary": "<краткий итог>", "strengths": ["..."], "weaknesses": ["..."]}\n\nВ strengths и weaknesses от 1 до 5 пунктов.`,
      });

      function extractJson(s: string): any {
        const cleaned = s.replace(/```json|```/g, "").trim();
        const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("AI не вернул JSON");
        return JSON.parse(cleaned.slice(start, end + 1));
      }

      let output: { score: number; summary: string; strengths: string[]; weaknesses: string[] };
      try {
        const parsed = extractJson(rawEval);
        output = {
          score: Math.round(Math.max(0, Math.min(5, Number(parsed.score) || 0)) * 10) / 10,
          summary: String(parsed.summary ?? "Беседа завершена."),
          strengths: Array.isArray(parsed.strengths) && parsed.strengths.length
            ? parsed.strengths.map(String).slice(0, 5) : ["Завершил диалог"],
          weaknesses: Array.isArray(parsed.weaknesses) && parsed.weaknesses.length
            ? parsed.weaknesses.map(String).slice(0, 5) : ["Нужно больше деталей"],
        };
      } catch {
        output = {
          score: 2.5, summary: "Не удалось автоматически оценить диалог.",
          strengths: ["Диалог доведён до конца"], weaknesses: ["Ответы можно сделать конкретнее"],
        };
      }

      await supabase.from("chat_sessions").update({
        completed: true, score: output.score, summary: output.summary,
        strengths: output.strengths, weaknesses: output.weaknesses,
        question_count: managerTurns,
      }).eq("id", session.id);

      const { data: prof } = await supabase.from("profiles").select("rating").eq("id", userId).single();
      const newRating = (prof?.rating ?? 0) + output.score;
      await supabase.from("profiles").update({ rating: newRating }).eq("id", userId);

      const farewell = "Спасибо за консультацию, всё понятно. До свидания!";
      await supabase.from("chat_messages").insert({
        session_id: session.id, user_id: userId, role: "bot", content: farewell,
      });

      return { finalized: true as const, botMessage: farewell, summary: output };
    }

    const aiMessages = history.map((m) => ({
      role: (m.role === "bot" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    }));

    const botReply = await generateClientReply({
      model, questions, aiMessages, lastManagerMessage: data.text,
    });

    await supabase.from("chat_messages").insert({
      session_id: session.id, user_id: userId, role: "bot", content: botReply,
    });
    await supabase.from("chat_sessions").update({ question_count: managerTurns }).eq("id", session.id);

    return { finalized: false as const, botMessage: botReply };
  });

const ClearInput = z.object({ sessionId: z.string().uuid() });
export const clearCollateralChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("chat_sessions").delete()
      .eq("id", data.sessionId).eq("user_id", userId);
    return { ok: true };
  });
