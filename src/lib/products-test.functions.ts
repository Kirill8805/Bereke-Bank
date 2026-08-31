import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { getChatModel } from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-2.5-flash";
const KIND = "products";
const QUESTION_COUNT = 5;

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

function pickQA(n: number): QA[] {
  return [...QA_BANK].sort(() => 0.5 - Math.random()).slice(0, n);
}

export const startProductsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("chat_sessions").delete().eq("user_id", userId).eq("kind", KIND).eq("completed", false);
    const qas = pickQA(QUESTION_COUNT);
    const { data: session, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: userId, kind: KIND, summary: JSON.stringify({ qas }) })
      .select()
      .single();
    if (error || !session) throw new Error(error?.message ?? "Не удалось создать тест");
    return { sessionId: session.id, questions: qas.map((x) => x.q) };
  });

const SubmitInput = z.object({ sessionId: z.string().uuid(), answer: z.string().min(1).max(5000) });

export const submitProductsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session, error: sErr } = await supabase
      .from("chat_sessions").select("*").eq("id", data.sessionId).eq("user_id", userId).single();
    if (sErr || !session) throw new Error("Тест не найден");
    if (session.completed) throw new Error("Тест уже завершён");

    let qas: QA[] = [];
    try {
      const parsed = session.summary ? JSON.parse(session.summary) : null;
      if (Array.isArray(parsed?.qas)) qas = parsed.qas;
    } catch { /* ignore */ }
    if (!qas.length) qas = pickQA(QUESTION_COUNT);

    await supabase.from("chat_messages").insert({
      session_id: session.id, user_id: userId, role: "manager", content: data.answer,
    });

    const model = await getChatModel(FALLBACK_MODEL);
    const referenceBlock = qas
      .map((x, i) => `Вопрос ${i + 1}: ${x.q}\nЭталонный ответ: ${x.a}`)
      .join("\n\n");

    const { text: rawEval } = await generateText({
      model,
      system: `Ты строгий, но справедливый экзаменатор Bereke Bank. Сравниваешь ответ менеджера с эталонными ответами по кредитным продуктам (залог квартиры/депозита, жилищный кредит). Если ответ менеджера приближённо передаёт смысл эталона (даже своими словами) — ставь максимальный балл. Снижай только за фактические ошибки или пропуски. Отвечай ТОЛЬКО валидным JSON, без markdown.`,
      prompt: `Вопросы и эталоны:\n\n${referenceBlock}\n\nОтвет сотрудника:\n"""${data.answer}"""\n\nВерни строго JSON:\n{"score": <0..5>, "summary": "<1-2 предложения>", "strengths": ["..."], "weaknesses": ["..."]}\n\nВ strengths и weaknesses от 1 до 5 пунктов.`,
    });

    function extractJson(s: string): any {
      const cleaned = s.replace(/```json|```/g, "").trim();
      const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
      if (a === -1 || b === -1) throw new Error("AI не вернул JSON");
      return JSON.parse(cleaned.slice(a, b + 1));
    }

    let output: { score: number; summary: string; strengths: string[]; weaknesses: string[] };
    try {
      const p = extractJson(rawEval);
      output = {
        score: Math.round(Math.max(0, Math.min(5, Number(p.score) || 0)) * 10) / 10,
        summary: String(p.summary ?? "Тест завершён."),
        strengths: Array.isArray(p.strengths) && p.strengths.length ? p.strengths.map(String).slice(0, 5) : ["Тест пройден до конца"],
        weaknesses: Array.isArray(p.weaknesses) && p.weaknesses.length ? p.weaknesses.map(String).slice(0, 5) : ["Повторите материал"],
      };
    } catch {
      output = { score: 2.5, summary: "Не удалось оценить автоматически.", strengths: ["Тест пройден"], weaknesses: ["Повторите материал"] };
    }

    await supabase.from("chat_sessions").update({
      completed: true, score: output.score, summary: output.summary,
      strengths: output.strengths, weaknesses: output.weaknesses, question_count: qas.length,
    }).eq("id", session.id);

    const { data: prof } = await supabase.from("profiles").select("rating").eq("id", userId).single();
    await supabase.from("profiles").update({ rating: (prof?.rating ?? 0) + output.score }).eq("id", userId);

    return { summary: output };
  });

const ClearInput = z.object({ sessionId: z.string().uuid() });
export const clearProductsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClearInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("chat_sessions").delete().eq("id", data.sessionId).eq("user_id", userId);
    return { ok: true };
  });
