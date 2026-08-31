import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { getChatModel } from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-2.5-flash";
const KIND = "knowledge";
const QUESTION_COUNT = 5;

type QA = { q: string; a: string };

const QA_BANK: QA[] = [
  {
    q: "Что такое Бонус (BNS) в программе B-Bonus и чему он равен?",
    a: "Бонус — условная единица, предоставляемая Клиенту за счёт собственных средств Банка. 1 Бонус (BNS) равен 1 тенге (KZT). Бонусы не являются деньгами.",
  },
  {
    q: "Что такое Бонусный счёт? Это банковский счёт?",
    a: "Бонусный счёт — специальный счёт Клиента для учёта операций по начислению и списанию Бонусов. Он НЕ является банковским счётом. Открывается автоматически при открытии текущего счёта и/или выпуске платёжной карты.",
  },
  {
    q: "Что такое кешбэк в рамках программы B-Bonus?",
    a: "Кешбэк — это денежные средства, зачисленные на текущий счёт Клиента с Бонусного счёта. Термины «Cashback» и «Бонус» могут использоваться Банком как синонимы в рекламных целях.",
  },
  {
    q: "Что такое B-Bonus+ и как его подключить?",
    a: "B-Bonus+ — опция начисления повышенных Бонусов в виде подписки. Подключить и отключить её можно в мобильном приложении Bereke Bank в разделе программы «B-Bonus».",
  },
  {
    q: "Сколько процентов бонусов начисляется клиенту с обычной дебетовой картой без подписки B-Bonus+ и с ней?",
    a: "Без подписки B-Bonus+ — 0%. С подключённой подпиской B-Bonus+ — 1% от суммы покупок.",
  },
  {
    q: "Сколько бонусов получает клиент с дебетовой картой при остатках на депозитах от 1 000 000 тенге?",
    a: "Без подписки B-Bonus+ — 0%, с подключённой подпиской B-Bonus+ — 3%. При этом процент за остатки на депозитах не суммируется с базовым 1%, выплачивается больший процент.",
  },
  {
    q: "Сколько бонусов получает клиент с премиальной дебетовой картой и клиент сегмента First?",
    a: "Премиальная дебетовая карта: 0% без подписки, 5% с подпиской B-Bonus+. Премиальная карта сегмента First: 5% и без подписки, и с подпиской B-Bonus+.",
  },
  {
    q: "По каким операциям бонусы НЕ начисляются?",
    a: "Бонусы не начисляются за: снятие наличных, зачисление денег на счёт, покупку валюты и крипты/электронных денег, переводы, оплату ставок и лотерей, оплату задолженности перед банками РК, покупку ценных бумаг, пополнение электронных кошельков, операции по корпоративным картам, оплату в ломбардах, оптовые покупки и оплату самими бонусами.",
  },
  {
    q: "Когда начисленные за месяц бонусы становятся доступными к выводу?",
    a: "Начисленные за расчётный месяц бонусы проходят проверку и становятся доступными к выводу на 5 календарный день следующего месяца. Проверка по покупкам с обработанным финансовым документом может длиться до 20 календарных дней следующего месяца.",
  },
  {
    q: "Как клиент может использовать бонусы?",
    a: "Бонусы можно вывести (перевести) на карточный/текущий счёт клиента в пределах остатка на Бонусном счёте. При переводе 1 Бонус конвертируется в 1 тенге. Напрямую с Бонусного счёта обналичить бонусы нельзя.",
  },
  {
    q: "Как считаются бонусы по операциям в иностранной валюте?",
    a: "Начисление производится в тенге (KZT) по курсу Банка, установленному на момент авторизации операции.",
  },
  {
    q: "Что будет с бонусами, если клиент вернёт товар или отменит операцию?",
    a: "Бонусы аннулируются (полностью или частично) при возврате товара/отмене операции независимо от причин, а также при ошибочном начислении или закрытии карты/счёта. Если бонусов на счёте недостаточно, образуется задолженность клиента перед банком.",
  },
  {
    q: "Что считается злоупотреблением программой B-Bonus?",
    a: "Например: оптовые и периодические закупы с личной карты на корпоративные нужды, переводы, замаскированные под retail, массовые покупки авиа/ж/д билетов не для себя, покупки только в категориях повышенных бонусов, более 30% оборота в этих категориях 2 месяца подряд, периодические покупки на игровых сайтах, в онлайн-казино, у букмекеров, на крипто-платформах и пополнение Qiwi/PayPal/WebMoney.",
  },
  {
    q: "Имеет ли право банк отказать в начислении бонусов или заблокировать бонусный счёт?",
    a: "Да. Предоставление бонусов — это право банка, а не обязанность. Банк вправе отказать в начислении, заблокировать бонусный счёт или исключить клиента из программы при задолженности, мошенничестве, злоупотреблении программой, подозрении на AML/финансирование терроризма и пр. — без предупреждения и без ответственности за убытки клиента.",
  },
  {
    q: "В каких странах бонусы и Nomad-баллы не начисляются?",
    a: "Бонусы и Nomad бонусные баллы не начисляются по операциям, проведённым на Кипре (Cyprus) и в Гибралтаре (Gibraltar).",
  },
  {
    q: "Где клиент видит начисленные Nomad-баллы и как с ними работать?",
    a: "Начисление производится на аккаунт клиента в Nomad Club партнёра до 2 рабочего дня следующего месяца. Просмотр баллов — в личном кабинете на сайте партнёра (Air Astana, Nomad Club). Условия траты — на сайте партнёра.",
  },
  {
    q: "Что такое Бонус-игра и где она доступна?",
    a: "Бонус-игра — это геймификационная механика, доступная клиентам в разделе «Бонусы» мобильного приложения Bereke Bank. Чтобы участвовать, клиент заходит в соответствующий раздел и, продолжая действия, подтверждает согласие с правилами.",
  },
];

function pickQA(n: number): QA[] {
  return [...QA_BANK].sort(() => 0.5 - Math.random()).slice(0, n);
}

export const startTest = createServerFn({ method: "POST" })
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

export const submitTest = createServerFn({ method: "POST" })
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
      else if (Array.isArray(parsed?.questions)) {
        qas = parsed.questions.map((q: string) => {
          const found = QA_BANK.find((x) => x.q === q);
          return found ?? { q, a: "" };
        });
      }
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
          `Вопрос ${i + 1}: ${x.q}\nЭталонный ответ: ${x.a || "(эталон отсутствует — оценивай по здравому смыслу банковского консультанта)"}`,
      )
      .join("\n\n");

    const { text: rawEval } = await generateText({
      model,
      system: `Ты строгий, но справедливый экзаменатор Bereke Bank. Сравниваешь ответ менеджера с эталонными ответами. Если ответ менеджера приближённо передаёт смысл эталона (даже своими словами, без точных цифр) — ставь максимальный балл. Снижай балл только за фактические ошибки, пропуски ключевых пунктов или полное отсутствие ответа на вопрос. Отвечай ТОЛЬКО валидным JSON, без markdown.`,
      prompt: `Сотруднику были заданы следующие вопросы и есть эталонные ответы:\n\n${referenceBlock}\n\nОтвет сотрудника (одним текстом, в свободной форме):\n"""${data.answer}"""\n\nОцени, насколько ответ сотрудника по смыслу соответствует эталонам. Если по смыслу всё совпадает — это 5/5, даже если формулировка другая. Верни строго JSON:\n{"score": <0..5>, "summary": "<1-2 предложения итога>", "strengths": ["<что верно>", ...], "weaknesses": ["<что упустил или сказал неверно>", ...]}\n\nВ strengths и weaknesses от 1 до 5 пунктов.`,
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
export const clearTest = createServerFn({ method: "POST" })
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
