# Code Review: `ai/tmp/git.log`

## Verdict

Коммит большой и в целом двигает `packages/cli` к рабочему состоянию, но в текущем виде я бы **не рекомендовал его мержить**. Есть несколько ошибок в safety/recovery/concurrency слое, из-за которых можно либо потерять recoverability, либо сломать защиту от параллельных запусков.

## Findings

### 1. **Critical** — `recover --resume` фактически не умеет продолжать незавершённые write-операции

**Где:** `packages/cli/src/cli/recover.ts`, `packages/cli/src/cli/init.ts`, `packages/cli/src/cli/sync.ts`, `packages/cli/src/core/journal.ts`

**Проблема:** `recover.ts` умеет продолжать write только если у journal-операции заполнен `stagedPath`:

```ts
if (op.op === "write" && op.stagedPath) {
  await commitStaged(op.stagedPath, join(root, op.path));
}
```

Но ни `init.ts`, ни `sync.ts` не записывают `stagedPath` обратно в journal после `stageFile(...)`. В итоге после крэша незавершённые write-операции остаются без адреса staging-файла, и `--resume` их просто пропускает.

Отдельно настораживает, что integration test на resume это не ловит: он вручную вызывает `commitStaged(...)`, а не прогоняет реальный путь через `recover.ts`.

**Почему это важно:** это ломает одно из ключевых обещаний recovery-модели: `helpers recover --resume` не доводит run до post-sync state.

### 2. **Critical** — lock-файл можно снять, даже если текущий процесс его не получал

**Где:** `packages/cli/src/cli/init.ts`, `packages/cli/src/cli/sync.ts`, `packages/cli/src/cli/add-target.ts`, `packages/cli/src/cli/remove.ts`, `packages/cli/src/cli/remove-target.ts`, `packages/cli/src/cli/recover.ts`

**Проблема:** mutating-команды вызывают `releaseMutatingGuard(...)` в `finally` без проверки, был ли lock реально захвачен. Если второй процесс запускается во время первого, `guardMutatingCommand(...)` может упасть на уже существующем живом lock, но `finally` всё равно выполнится и удалит чужой `lock.pid`.

Похожая проблема в `recover.ts`: команда вообще не делает `acquireProcessLock(...)`, но в `finally` вызывает `releaseProcessLock(root)`, то есть тоже может снести lock другого живого процесса.

**Почему это важно:** после такого второй и последующие процессы смогут зайти параллельно, хотя защита от concurrency формально "есть". Это уже не просто race-window, а прямое разрушение lock ownership.

**Что исправить:** отслеживать факт успешного acquire локально в команде и release делать только если lock действительно был получен текущим процессом. Для `recover` нужен такой же acquire/release lifecycle, как у остальных mutating-команд.

### 3. **High** — `acquireProcessLock` сам по себе не атомарен и допускает двойной захват

**Где:** `packages/cli/src/core/process-lock.ts`

**Проблема:** реализация строится как `read existing -> decide -> writeFile`, причём финальная запись идёт обычным `writeFile(...)`, не эксклюзивным create. Два процесса могут одновременно не увидеть lock, оба пройти проверку и оба записать свой PID.

```ts
await writeFile(lockPath, process.pid.toString(), "utf8");
```

Это TOCTOU race: сам advisory lock не гарантирует эксклюзивность.

**Почему это важно:** concurrency guard становится ненадёжным именно в том сценарии, ради которого он существует — одновременный старт двух mutating-команд.

**Что исправить:** писать lock через atomic exclusive create (`open(..., "wx")` / `writeFile(..., { flag: "wx" })`) и только при `EEXIST` делать повторное чтение и проверку PID.

### 4. **High** — `--offline` всё равно делает сетевой запрос в GitHub API

**Где:** `packages/cli/src/core/fetch.ts`

**Проблема:** `fetchSource(..., { offline: true })` передаёт offline в `giget`, но потом безусловно вызывает `resolveCommitSha(...)`, а тот ходит в:

```ts
https://api.github.com/repos/${owner}/${repo}/commits/${branch}
```

То есть даже в offline-режиме код всё равно пытается выйти в сеть.

**Почему это важно:** это прямое нарушение контракта `--offline` / `NFR-002`. В среде без сети команда либо зависнет/упадёт, либо начнёт silently деградировать к `ref ?? "unknown"` вместо корректного resolved commit SHA.

### 5. **Medium** — `matchGlob` компилирует glob в regex без экранирования большинства regex-метасимволов

**Где:** `packages/cli/src/core/glob.ts`

**Проблема:** кроме `.` код не экранирует литеральные символы перед сборкой `RegExp`. Любые `(`, `)`, `[`, `]`, `+`, `^`, `$`, `|`, `\\` попадают в regex как управляющие символы.

```ts
} else {
  regexStr += pattern[i];
}
```

**Почему это важно:** matcher может либо ложно матчить, либо вообще падать на валидных строковых шаблонах/путях. Это особенно неприятно в manifest-driven tool, где правильность `sources` и `pipeline.match` влияет на весь graph генерации.

## Recommendation

Перед merge я бы потребовал минимум:

1. починить `recover --resume` через реальный `stagedPath` в journal и обновить тест, чтобы он проходил через `recover.ts`;
2. переделать lifecycle process lock с ownership-aware release;
3. сделать acquire атомарным;
4. убрать любые network calls из offline-path;
5. экранировать regex-метасимволы в glob compiler.
