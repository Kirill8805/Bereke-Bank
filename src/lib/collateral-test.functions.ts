import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { getChatModel } from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-2.5-flash";
const KIND = "collateral_knowledge";
const QUESTION_COUNT = 5;

type QA = { q: string; a: string };

const QA_BANK: QA[] = [
  {
    q: "Какая процентная ставка по залоговому кредиту в Bereke Bank?",
    a: "От 22,6% до 30% годовых (ГЭСВ от 26,1% до 34,9%).",
  },
  {
    q: "На какие цели можно оформить залоговый кредит?",
    a: "На рефинансирование займов БВУ и на потребительские цели, не связанные с предпринимательской деятельностью.",
  },
  {
    q: "Минимальная и максимальная сумма залогового кредита?",
    a: "Минимум 3 000 000 тенге, максимум — до 70% от оценочной стоимости недвижимости, но не более 50 000 000 тенге. Валюта — тенге.",
  },
  {
    q: "Срок кредитования по залоговому кредиту?",
    a: "От 36 до 120 месяцев.",
  },
  {
    q: "Какая комиссия за организацию займа и какое страхование требуется?",
    a: "Комиссия за организацию займа — 0%. Обязательное страхование от несчастного случая / жизни заёмщика.",
  },
  {
    q: "Какие требования к заёмщику по возрасту и гражданству?",
    a: "Возраст от 21 года до достижения пенсионного возраста на момент окончания срока кредита. Гражданство РК или ВНЖ. Созаёмщики не предусмотрены, гаранты — предусмотрены.",
  },
  {
    q: "Какие типы недвижимости принимаются в залог?",
    a: "Квартира в многоквартирном доме; жилой дом (в т.ч. часть дома) с земельным участком; коммерческая недвижимость (помещения в части зданий). Собственником может быть как сам заёмщик, так и третье лицо (от 18 лет до пенсионного возраста на момент окончания срока кредита).",
  },
  {
    q: "Какие базовые требования к квартире в многоквартирном доме (стандартные условия)?",
    a: "Год постройки не ранее 1960, этажность дома не менее 3, общая площадь не менее 20 кв.м, в рамках географии продаж. Обязательны централизованные электроснабжение, холодная вода и канализация; изолированные кухня и санузел. LTV не более 0,7.",
  },
  {
    q: "Из каких материалов стен дом НЕ принимается в залог?",
    a: "Не принимаются дома со стенами из сырцового, сборно-щитового, каркасно-засыпного, глинобитного, каркасно-камышитового, шпального материала, самана и ЛСТК (легких стальных тонкостенных конструкций).",
  },
  {
    q: "Какие особые условия по квартире при несоответствии одного из стандартных пунктов?",
    a: "При несовпадении 1 из отмеченных параметров допускается несоответствие целевого назначения фактическому использованию, а LTV снижается до не более 0,5.",
  },
  {
    q: "Требования к коммерческой недвижимости (помещения в части здания)?",
    a: "Год постройки не ранее 1960, площадь без ограничений. Исключаются цокольные, подвальные и технические этажи без отделки. Обязательны электро-, водоснабжение и канализация. LTV не более 0,7 (зеркальный вариант с LTV 0,5 без ограничений по этажности).",
  },
  {
    q: "Базовые требования к жилому дому с земельным участком (стандарт)?",
    a: "Год постройки не ранее 1970, общая площадь не менее 70 кв.м, в населённом пункте с филиалом/СПФ Банка или не далее 30 км от него. Коммуникации (электричество, вода/скважина, канализация/септик, отопление) с вводом в дом. LTV не более 0,7.",
  },
  {
    q: "Условия по жилому дому из самана/сырца в южных регионах?",
    a: "Год постройки не ранее 2005, строго в Кызылорде, Шымкенте, Туркестане, Таразе, Сарыагаше или не далее 30 км от их черты. Земельный участок не менее 0,05 га (5 соток), ПЧС. Кухня и санузел могут быть вне дома. LTV не более 0,5.",
  },
  {
    q: "Условия по жилому дому из дерева/бруса/шпал?",
    a: "Год постройки не ранее 2005, площадь не менее 100 кв.м, обязательно наружная отделка (облицовочный кирпич, сайдинг, термопанели, фасадная штукатурка). Дом должен соответствовать современному архитектурно-планировочному решению. LTV не более 0,5.",
  },
  {
    q: "Условия по жилому дому с мансардным этажом?",
    a: "Год постройки не ранее 2005, площадь не менее 100 кв.м. Основной дом — стандартные материалы, для мансарды допускается брус/дерево. Мансарда должна быть с чистовым ремонтом и пригодна для проживания. LTV не более 0,5.",
  },
  {
    q: "Какие несоответствия по квартире являются НЕприемлемыми и ведут к отказу?",
    a: "Вынос газоснабжения на балкон, перенос санузла в «сухие зоны» или расширение кухни/санузла за счёт жилых комнат, размещение магазинов, общепита или промышленного оборудования, наличие арестов и обременений третьих лиц (должны быть сняты до выдачи).",
  },
  {
    q: "Какие неприемлемые несоответствия по жилому дому с земельным участком?",
    a: "Объект вне географии продаж, отсутствие забора по периметру, кустарное отопительное оборудование без документов, доступ к участку только через соседний участок, полное отсутствие коммуникаций, краткосрочная аренда участка или срок аренды меньше срока кредита, отсутствие фундамента, использование как общежития барачного типа.",
  },
  {
    q: "Кто осматривает квартиру стоимостью до 50 млн тенге при отчёте оценщика-партнёра?",
    a: "Осмотр сотрудником банка не требуется. Если отчёт от не партнёра — осматривает ДРЗИ (при невозможности — кредитный менеджер).",
  },
  {
    q: "Кто осматривает квартиру или дом стоимостью более 50 млн тенге?",
    a: "Осматривает ДРЗИ; при невозможности — кредитный менеджер совместно с сотрудником Дирекции безопасности (вне зависимости от того, партнёр оценщик или нет).",
  },
];

function pickQA(n: number): QA[] {
  return [...QA_BANK].sort(() => 0.5 - Math.random()).slice(0, n);
}

export const startCollateralTest = createServerFn({ method: "POST" })
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

export const submitCollateralTest = createServerFn({ method: "POST" })
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
      .map((x, i) => `Вопрос ${i + 1}: ${x.q}\nЭталонный ответ: ${x.a}`)
      .join("\n\n");

    const { text: rawEval } = await generateText({
      model,
      system: `Ты строгий, но справедливый экзаменатор Bereke Bank по теме "Залоги и требования к объектам недвижимости". Сравниваешь ответ менеджера с эталонными ответами. Если ответ приближённо передаёт смысл и ключевые параметры (LTV, год постройки, площадь, материал стен, суммы) — ставь максимальный балл. Снижай балл за фактические ошибки или пропуск ключевых пунктов. Отвечай ТОЛЬКО валидным JSON, без markdown.`,
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
export const clearCollateralTest = createServerFn({ method: "POST" })
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
