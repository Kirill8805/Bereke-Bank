import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, type LanguageModel } from "ai";
import { getChatModel } from "./ai-gateway.server";
import { TRAINING_QUESTIONS } from "./constants";

const FALLBACK_MODEL = "google/gemini-2.5-flash";
const MAX_TURNS = 5;

const BOT_NAME = "Гиперион";

function pickQuestions(n: number): string[] {
  const shuffled = [...TRAINING_QUESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function systemPrompt(questions: string[]) {
  return `Ты КЛИЕНТ банка Bereke Bank по имени ${BOT_NAME}. Обычный человек с улицы. НЕ работаешь в банке, НЕ знаешь банковских процессов. Пользователь — это МЕНЕДЖЕР банка, он отвечает ТЕБЕ.

КРИТИЧЕСКИ ВАЖНО — ты всегда клиент, в КАЖДОМ сообщении, не только в первом:
- Здороваешься ТОЛЬКО в самом первом сообщении. Дальше НИКОГДА не пиши «Здравствуйте», «Добрый день» и не представляйся снова.
- НИКОГДА не подтверждай и не объясняй банковские услуги. Фразы типа «Да, конечно, вы можете...», «Вы можете частично досрочно погасить кредит», «Для этого нужно...» — ЗАПРЕЩЕНЫ. Так говорит сотрудник, а не клиент.
- НИКОГДА не отвечай на свой же вопрос. Если менеджер ответил тебе «нет», «да» или дал короткий/непонятный ответ — переспроси КАК КЛИЕНТ: «как это нет?», «а почему?», «а что тогда делать?», «а можно подробнее объяснить?».
- Не давай инструкций, не перечисляй документы, не называй комиссии, тарифы, сроки. Ты этого не знаешь — ты пришёл узнать.

ТЫ ТОЛЬКО:
- задаёшь вопросы от первого лица («а можно...?», «а сколько...?», «а если у меня...?»);
- реагируешь коротко на ответ менеджера («ага», «понятно», «хм, а...», «спасибо, а ещё...»);
- если менеджер ответил странно/непонятно/односложно — удивляешься и переспрашиваешь как обычный человек.

ТЕМЫ, по которым ТЕБЕ нужна консультация (задавай СВОИМИ словами, по одной за раз):
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

ФОРМАТ: 1–3 предложения, только русский, без markdown, без списков, без подписей «Клиент:»/«Менеджер:». Никогда не говори, что ты ИИ.`;
}

function looksLikeEmployeeReply(text: string) {
  const normalized = text.toLowerCase().replace(/ё/g, "е").trim();

  const employeePatterns = [
    /рад вас приветствовать/,
    /чем могу помочь/,
    /я могу вам помочь/,
    /вы можете/,
    /для этого нужно/,
    /вам необходимо/,
    /вам нужно/,
    /это когда/,
    /это значит/,
    /комисси/,
    /тариф/,
    /документ/,
    /срок/,
    /процентн/,
    /кредит/,
    /перевод/,
    /платеж/,
    /оформит/,
    /погашени/,
  ];

  const forbiddenGreeting = /^(здравствуйте|добрый день|приветствую)/.test(normalized);
  const hasEmployeePattern = employeePatterns.some((pattern) => pattern.test(normalized));

  return forbiddenGreeting || hasEmployeePattern;
}

async function generateClientReply({
  model,
  questions,
  aiMessages,
  lastManagerMessage,
}: {
  model: LanguageModel;
  questions: string[];
  aiMessages: Array<{ role: "assistant" | "user"; content: string }>;
  lastManagerMessage: string;
}) {
  let text: string;
  try {
    const res = await generateText({
      model,
      temperature: 0.2,
      system:
        systemPrompt(questions) +
        `\n\nДОПОЛНИТЕЛЬНЫЕ ПРАВИЛА ДЛЯ КАЖДОГО ОТВЕТА:
- Если менеджер ответил грубо, странно, коротко или непонятно — НЕ объясняй продукт. Вместо этого уточни, удивись или переформулируй вопрос как клиент.
- Ты не знаешь банковские термины глубоко. Если речь о сложном термине, спрашивай простыми словами, а не объясняй сам.
- Твой следующий ответ должен быть продолжением реплики клиента, а не консультацией сотрудника.`,
      messages: aiMessages,
    });
    text = res.text;
  } catch (e: any) {
    console.error("[generateClientReply] AI error:", e?.name, e?.message, e?.statusCode, e?.responseBody, e?.data);
    throw new Error(`AI: ${e?.message ?? "unknown"} (status=${e?.statusCode ?? "?"})`);
  }

  const firstAttempt = text.trim();
  if (!looksLikeEmployeeReply(firstAttempt)) return firstAttempt;

  const { text: repaired } = await generateText({
    model,
    temperature: 0.1,
    system: systemPrompt(questions),
    prompt: `Менеджер только что ответил тебе так: "${lastManagerMessage}".

Ты СЛУЧАЙНО начал говорить как сотрудник банка. Это ошибка. Перепиши ТОЛЬКО следующую реплику правильно — как обычный клиент банка.

ЖЁСТКИЕ ТРЕБОВАНИЯ:
- не здоровайся;
- не объясняй термины и продукты;
- не инструктируй;
- не говори от лица банка;
- лучше переспроси, уточни или попроси объяснить проще;
- 1–2 коротких предложения.

Верни только исправленную реплику клиента.`,
  });

  return repaired.trim();
}

export const startChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Close any unfinished session
    await supabase.from("chat_sessions").delete().eq("user_id", userId).eq("kind", "roleplay").eq("completed", false);

    const questions = pickQuestions(MAX_TURNS);

    const { data: session, error: sErr } = await supabase
      .from("chat_sessions")
      .insert({ user_id: userId, kind: "roleplay" })
      .select()
      .single();
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
      console.error("[startChat] AI error:", error?.message, error?.statusCode);
      throw new Error(`AI: ${error?.message ?? "unknown"} (status=${error?.statusCode ?? "?"})`);
    }

    await supabase.from("chat_messages").insert({
      session_id: session.id,
      user_id: userId,
      role: "bot",
      content: greeting,
    });

    await supabase
      .from("chat_sessions")
      .update({ summary: JSON.stringify({ questions }) })
      .eq("id", session.id);

    return { sessionId: session.id, greeting };
  });

const SendInput = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1).max(2000),
});

export const sendManagerMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: session, error: sErr } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .single();
    if (sErr || !session) throw new Error("Сессия не найдена");
    if (session.completed) throw new Error("Диалог уже завершён");

    // Insert manager message
    await supabase.from("chat_messages").insert({
      session_id: session.id,
      user_id: userId,
      role: "manager",
      content: data.text,
    });

    // Load full history
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    const history = msgs ?? [];
    const managerTurns = history.filter((m) => m.role === "manager").length;

    let questions: string[] = [];
    try {
      const parsed = session.summary ? JSON.parse(session.summary) : null;
      if (parsed?.questions) questions = parsed.questions;
    } catch {
      questions = [];
    }
    if (questions.length === 0) questions = pickQuestions(MAX_TURNS);

    const model = await getChatModel(FALLBACK_MODEL);

    // If reached MAX_TURNS manager replies → finalize
    if (managerTurns >= MAX_TURNS) {
      const transcript = history.map((m) => `${m.role === "bot" ? "Клиент" : "Менеджер"}: ${m.content}`).join("\n");

      const { text: rawEval } = await generateText({
        model,
        system: `Ты строгий, но справедливый тренер для банковских менеджеров Bereke Bank. Отвечай ТОЛЬКО валидным JSON без markdown, без \`\`\`, без пояснений.`,
        prompt: `Диалог между клиентом и менеджером:\n\n${transcript}\n\nОцени работу менеджера и верни строго такой JSON:\n{"score": <число от 0 до 5 с одним знаком после запятой>, "summary": "<краткий итог на русском>", "strengths": ["<сильная сторона>", ...], "weaknesses": ["<слабая сторона>", ...]}\n\nВ strengths и weaknesses от 1 до 5 пунктов.`,
      });

      function extractJson(s: string): any {
        const cleaned = s.replace(/```json|```/g, "").trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("AI не вернул JSON");
        return JSON.parse(cleaned.slice(start, end + 1));
      }

      let output: { score: number; summary: string; strengths: string[]; weaknesses: string[] };
      try {
        const parsed = extractJson(rawEval);
        output = {
          score: Math.round(Math.max(0, Math.min(5, Number(parsed.score) || 0)) * 10) / 10,
          summary: String(parsed.summary ?? "Беседа завершена."),
          strengths:
            Array.isArray(parsed.strengths) && parsed.strengths.length
              ? parsed.strengths.map(String).slice(0, 5)
              : ["Завершил диалог"],
          weaknesses:
            Array.isArray(parsed.weaknesses) && parsed.weaknesses.length
              ? parsed.weaknesses.map(String).slice(0, 5)
              : ["Нужно больше деталей в ответах"],
        };
      } catch {
        output = {
          score: 2.5,
          summary: "Не удалось автоматически оценить диалог. Попробуйте ещё раз.",
          strengths: ["Диалог доведён до конца"],
          weaknesses: ["Ответы можно сделать конкретнее"],
        };
      }

      await supabase
        .from("chat_sessions")
        .update({
          completed: true,
          score: output.score,
          summary: output.summary,
          strengths: output.strengths,
          weaknesses: output.weaknesses,
          question_count: managerTurns,
        })
        .eq("id", session.id);

      // Increment rating
      const { data: prof } = await supabase.from("profiles").select("rating").eq("id", userId).single();
      const newRating = (prof?.rating ?? 0) + output.score;
      await supabase.from("profiles").update({ rating: newRating }).eq("id", userId);

      // Final farewell bot message
      const farewell = "Спасибо за консультацию, всё понятно. До свидания!";
      await supabase.from("chat_messages").insert({
        session_id: session.id,
        user_id: userId,
        role: "bot",
        content: farewell,
      });

      return {
        finalized: true as const,
        botMessage: farewell,
        summary: {
          score: output.score,
          summary: output.summary,
          strengths: output.strengths,
          weaknesses: output.weaknesses,
        },
      };
    }

    // Otherwise: generate next bot reply
    const aiMessages = history.map((m) => ({
      role: (m.role === "bot" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    }));

    const botReply = await generateClientReply({
      model,
      questions,
      aiMessages,
      lastManagerMessage: data.text,
    });

    await supabase.from("chat_messages").insert({
      session_id: session.id,
      user_id: userId,
      role: "bot",
      content: botReply,
    });
    await supabase.from("chat_sessions").update({ question_count: managerTurns }).eq("id", session.id);

    return { finalized: false as const, botMessage: botReply };
  });

const ClearInput = z.object({ sessionId: z.string().uuid() });
export const clearChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("chat_sessions").delete().eq("id", data.sessionId).eq("user_id", userId);
    return { ok: true };
  });
