## Что меняю

Запросы и так идут через Lovable AI Gateway (`createLovableGateway` + `LOVABLE_API_KEY`) — это и есть «использовать Lovable AI». У шлюза нет собственной модели, он проксирует google/* и openai/*. Проблема 403 — в выбранной preview-модели.

Меняю константу `MODEL` со `google/gemini-3.1-flash-lite-preview` на стабильную дефолтную для Lovable AI: **`google/gemini-3-flash-preview`** в двух файлах:

- `src/lib/chat.functions.ts` (строка 8)
- `src/lib/test.functions.ts` (та же константа)

Больше ничего не трогаю: логика промптов, валидации «ответ как сотрудник», финализация диалога и оценки остаются как есть.

## Если этот вариант тоже даст 403

Откачусь на `google/gemini-2.5-flash` — он стабильно доступен на всех тарифах Lovable AI. Дайте знать, какой из двух предпочесть, или просто подтвердите план — поставлю `gemini-3-flash-preview`.