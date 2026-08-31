import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { getChatModel } from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-2.5-flash";
const KIND = "limits_knowledge";
const QUESTION_COUNT = 5;

type QA = { q: string; a: string };

const QA_BANK: QA[] = [
  {
    q: "Какой суточный лимит на снятие наличных в банкоматах в Казахстане и за границей по картам Bereke?",
    a: "2 000 000 KZT в сутки (либо эквивалент в другой валюте). Для клиентов пакетов услуг Premier, First, Exclusive лимит можно увеличить до 10 000 000 тенге на 5 дней по звонку в КЦ.",
  },
  {
    q: "Какие лимиты на снятие средств через банкомат Bereke Bank без карты?",
    a: "100 000 KZT за операцию и 300 000 KZT в сутки. Лимит изменить нельзя.",
  },
  {
    q: "Какой годовой лимит на снятие наличных в кассах и банкоматах?",
    a: "20 000 000 KZT для всех клиентов. 40 000 000 KZT — для клиентов с пакетом Premier. 50 000 000 KZT — для клиентов с пакетом First. Лимит изменить нельзя.",
  },
  {
    q: "Какие лимиты на снятие наличных в банкоматах Bereke Bank по картам Visa/Mastercard других банков?",
    a: "240 USD (или эквивалент) за операцию и 240 USD в сутки. Изменить лимит нельзя.",
  },
  {
    q: "Какие лимиты на снятие в банкоматах Bereke по картам RBK, ForteBank, EurasianBank (и наоборот)?",
    a: "200 000 KZT за операцию и 500 000 KZT в сутки. Ограничение на стороне RBK/ForteBank/EurasianBank, изменить нельзя. Рекомендации: снять на следующий день, использовать другую карту, обратиться в банкомат Bereke.",
  },
  {
    q: "Какой лимит на перевод по номеру карты через МП Bereke Bank?",
    a: "4 200 000 KZT на один перевод и 4 200 000 KZT в сутки. Рекомендация — сделать перевод на следующий рабочий день.",
  },
  {
    q: "Какие лимиты на переводы между своими счетами через МП?",
    a: "Лимит на один перевод отсутствует. Суточный лимит — 20 000 000 KZT.",
  },
  {
    q: "Какие лимиты на переводы по номеру телефона?",
    a: "500 000 KZT на один перевод (для системы СМП) и 10 000 000 KZT в сутки.",
  },
  {
    q: "Какие лимиты на переводы по номеру счёта внутри РК?",
    a: "10 000 000 KZT на один перевод и 10 000 000 KZT в сутки.",
  },
  {
    q: "Какие лимиты на переводы по номеру счёта за пределы РК (SWIFT)?",
    a: "100 000 USD на один перевод и 100 000 USD в сутки.",
  },
  {
    q: "Какие лимиты на переводы «Золотая корона»?",
    a: "4 200 000 KZT на один перевод и 4 200 000 KZT в сутки.",
  },
  {
    q: "Какие лимиты на переводы в Россию через приложение Bereke?",
    a: "100 000 USD на один перевод и 100 000 USD в сутки.",
  },
  {
    q: "Какие лимиты на переводы по номеру карты в Россию через партнёра?",
    a: "Минимум 20 000 KZT, максимум 400 000 KZT за перевод. Суточный лимит — 1 500 000 KZT.",
  },
  {
    q: "Какие лимиты на переводы в Кыргызстан (Элкат) по номеру карты через партнёра?",
    a: "Минимум 20 KZT, максимум 75 000 KZT за перевод. Суточный лимит — 200 000 KZT.",
  },
  {
    q: "Какие лимиты на переводы в Таджикистан через КортиМилли?",
    a: "Минимум 100 KZT, максимум 75 000 KZT за перевод. Суточный лимит — 500 000 KZT.",
  },
  {
    q: "Какие лимиты на переводы в Узбекистан (HUMO и UZCARD)?",
    a: "HUMO: мин 1 000 KZT, макс 130 000 KZT за перевод, 500 000 KZT в сутки. UZCARD: мин 1 000 KZT, макс 180 000 KZT за перевод, 500 000 KZT в сутки.",
  },
  {
    q: "Можно ли через оператора КЦ снять лимит/ограничение по карте и на какой срок?",
    a: "Да, операторы контакт-центра могут снять лимит/ограничение по карте по звонку клиента сроком не более чем на 30 дней. Для более длительного срока необходимо подать заявление в отделении банка.",
  },
];

function pickQA(n: number): QA[] {
  return [...QA_BANK].sort(() => 0.5 - Math.random()).slice(0, n);
}

export const startLimitsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    await supabase
      .from("chat_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("kind", KIND)
      .eq("completed", false);

    const qas = pickQA(QUESTION_COUNT);
    const questions = qas.map((x) => x.q);

    const { data: session, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: userId, kind: KIND, summary: JSON.stringify({ qas }) })
      .select()
      .single();
    if (error || !session) throw new Error(error?.message ?? "Не удалось создать тест");

    return { sessionId: session.id, questions };
  });

const SubmitInput = z.object({
  sessionId: z.string().uuid(),
  answer: z.string().min(1).max(5000),
});

export const submitLimitsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: session, error: sErr } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", data.sessionId)
      .eq("user_id", userId)
      .single();
    if (sErr || !session) throw new Error("Тест не найден");
    if (session.completed) throw new Error("Тест уже завершён");

    let qas: QA[] = [];
    try {
      const parsed = session.summary ? JSON.parse(session.summary) : null;
      if (Array.isArray(parsed?.qas)) qas = parsed.qas;
    } catch {
      /* ignore */
    }
    if (!qas.length) qas = pickQA(QUESTION_COUNT);

    await supabase.from("chat_messages").insert({
      session_id: session.id,
      user_id: userId,
      role: "manager",
      content: data.answer,
    });

    const model = await getChatModel(FALLBACK_MODEL);

    const referenceBlock = qas
      .map(
        (x, i) =>
          `Вопрос ${i + 1}: ${x.q}\nЭталонный ответ: ${x.a}`,
      )
      .join("\n\n");

    const { text: rawEval } = await generateText({
      model,
      system: `Ты строгий, но справедливый экзаменатор Bereke Bank по теме "Лимиты по операциям и переводам". Сравниваешь ответ менеджера с эталонными ответами. Если ответ приближённо передаёт смысл и ключевые цифры — ставь максимальный балл. Снижай балл за фактические ошибки (неверные суммы, валюту, условия) или пропуск ключевых пунктов. Отвечай ТОЛЬКО валидным JSON, без markdown.`,
      prompt: `Эталонные вопросы и ответы:\n\n${referenceBlock}\n\nОтвет сотрудника:\n"""${data.answer}"""\n\nОцени соответствие. Верни строго JSON:\n{"score": <0..5>, "summary": "<1-2 предложения>", "strengths": ["..."], "weaknesses": ["..."]}\n\nВ strengths и weaknesses от 1 до 5 пунктов.`,
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
        summary: String(parsed.summary ?? "Тест завершён."),
        strengths:
          Array.isArray(parsed.strengths) && parsed.strengths.length
            ? parsed.strengths.map(String).slice(0, 5)
            : ["Тест пройден до конца"],
        weaknesses:
          Array.isArray(parsed.weaknesses) && parsed.weaknesses.length
            ? parsed.weaknesses.map(String).slice(0, 5)
            : ["Повторите материал"],
      };
    } catch {
      output = {
        score: 2.5,
        summary: "Не удалось автоматически оценить тест. Попробуйте ещё раз.",
        strengths: ["Тест пройден до конца"],
        weaknesses: ["Повторите материал"],
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
        question_count: qas.length,
      })
      .eq("id", session.id);

    const { data: prof } = await supabase
      .from("profiles")
      .select("rating")
      .eq("id", userId)
      .single();
    const newRating = (prof?.rating ?? 0) + output.score;
    await supabase.from("profiles").update({ rating: newRating }).eq("id", userId);

    return { summary: output };
  });

const ClearInput = z.object({ sessionId: z.string().uuid() });
export const clearLimitsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", data.sessionId)
      .eq("user_id", userId);
    return { ok: true };
  });
