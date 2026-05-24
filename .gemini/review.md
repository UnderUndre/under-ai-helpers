# 🧐 Code Review: `clai-helpers`

*«Батя в здании. Просмотрел коммит 1498b847... Выглядит как мощный монолит, но есть пара мест, где болты нужно затянуть покрепче.»*

В соответствии с протоколом `[/code-reviewer]`, ниже представлен анализ имплементации `underundre-helpers` по итогам гигантского коммита с реализацией 11 команд, 7 трансформеров и механизма safety (journal/locks).

---

## 1. Architectural Analysis (Что завезено)

Код написан очень чисто. `citty` — отличный выбор для CLI. TypeScript Strict Mode выдержан.

- **Safety First:** Вижу `staging.js`, `journal.js` и `process-lock.js`. Это ядро системы. Вы изолировали мутабельные операции от CLI-хендлеров, что очень круто.
- **Stale Journal Gate:** Условная проверка в `cli.ts` `guardMutatingCommand` — идеальная точка перехвата, чтобы не дать `sync` или `add-target` сломать базу при наличии незавершенного журнала (FR-020).
- **Test Coverage:** 128 тестов (77 unit + 51 int) — мое почтение. Это уровень Production-Grade.

## 2. Findings & Priority Improvements

### 🔴 [High] Race Condition: `acquireProcessLock` vs `readJournal`

**Где:** `packages/cli/src/cli.ts`, функция `guardMutatingCommand`
**Проблема:** Сейчас логика такая:

1. `readJournal()` -> Проверяем stale.
2. `acquireProcessLock(root)`.

Если запустить два параллельных `helpers sync`, они **оба** могут прочитать чистый журнал (шаг 1). Затем Process 1 берет лок и начинает писать в журнал. Process 2 ждет. Process 1 падает. Process 2 получает лок и... начинает работу, потому что он **уже прошел** проверку журнала!
**Как фиксить:** Всегда бери лок **ДО** чтения мутабельного стейта.

```ts
await acquireProcessLock(root);
const journal = await readJournal(root);
if (journal && hasIncomplete) {
  await releaseProcessLock(root); // Не забыть отпустить лок при ошибке
  throw new Error("Stale journal...");
}
```

### 🟡 [Medium] Обработка `ExitCode.StaleJournal` и CLI Lifecycle

**Где:** `packages/cli/src/cli.ts`
**Проблема:** В `guardMutatingCommand` (строка ~2227) идет `process.exitCode = ExitCode.StaleJournal; throw new Error(...)`. Ошибка улетит наверх в `runMain(main)`, `citty` ее перехватит, напечатает дефолтным `consola.error` (а тут уже был напечатан кастомный текст), и может перезаписать `exitCode` на `1`.
**Как фиксить:** `citty` лучше хендлить через `process.exit(ExitCode.StaleJournal)` внутри кастомного обработчика, либо убедиться, что `citty` не глушит ваши кастомные ExitCodes (например, бросать кастомный `class CLIError extends Error { code: number }`).

### 🟡 [Medium] JSON Output vs Visual Logging

**Где:** `cli.ts` `args.json` (FR-015)
**Проблема:** В `diff.ts` видим `consola.success("No changes...")` и `consola.log(...)`. Если CLI вызван с флагом `--json`, `consola` всё равно будет выводить цветной текст в `stdout`/`stderr`. Это сломает парсинг JSON скриптами на других платформах.
**Как фиксить:** Сделать wrapper для логгера, который при `--json` работает как `silent` для текстовых сообщений, и в конце выводит один `process.stdout.write(JSON.stringify(result))`.

### 🟢 [Low] Explicit offline caching in `giget`

**Где:** `packages/cli/src/cli/add-target.ts` (строка ~2312)
**Проблема:** Передан `{ preferOffline: true }`. У giget агрессивное кэширование. Если пользователь хочет принудительно стянуть свежую ветку игнорируя кэш (какой-нибудь `helpers sync --force-refresh`), текущий CLI этого не предоставляет. Стоит иметь в виду на будущее (например, если `--offline` не передан, делать `preferOffline: false`).

---

## 3. Verdict

**Реализация — топ.** Абстракции файлов понятны (`discoverFiles`, `targetPath` resolution). Трансформеры красиво разведены в отдельный реестр. Единственный настоящий Blocker, который нужно пофиксить прямо сейчас (до релиза в CI) — это порядок Лок -> Чтение Журнала в `guardMutatingCommand`.

Как исправишь `acquireProcessLock` — архитектура будет бетонной. Можешь коммитить и переходить к E2E.
