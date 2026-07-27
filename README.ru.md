# AI Helpers

Коллекция промптов, агентов, скиллов и CLI-инструмент для AI-разработки. Пишешь один раз в формате Claude — синхронизируешь в GitHub Copilot и Google Gemini автоматически.

[English version](README.md)

## Что внутри

```
.claude/          # Источник истины: команды, агенты, скиллы
.github/          # Copilot промпты и инструкции (авто-генерация)
.gemini/          # Gemini команды и агенты (авто-генерация)
packages/cli/     # CLI-инструмент для транспиляции
packages/underboard/ # MCP-сервис памяти и задач
specs/            # Спецификации и дизайн-документы
```

## CLI: `underundre-clai-helpers`

Ядро репозитория. Берёт `.claude/` как единый источник истины и транспилирует в форматы Copilot, Gemini и Antigravity.

### Установка в проект

```bash
npx underundre-clai-helpers init --source github:UnderUndre/under-ai-helpers
```

Генерирует `.claude/`, `.github/prompts/`, `.github/instructions/`, `.gemini/commands/`, `.gemini/agents/`, `CLAUDE.md`, `GEMINI.md` и `helpers-lock.json`.

### Обновление

```bash
npx underundre-clai-helpers sync --upgrade
```

### Проверка дрифта в CI

```bash
npx underundre-clai-helpers status --strict
# Код выхода 2 = кто-то руками отредактировал управляемый файл
```

### Выборочные таргеты

```bash
# Только Claude (без Copilot/Gemini)
npx underundre-clai-helpers init --source github:UnderUndre/under-ai-helpers --targets claude

# Добавить Copilot позже
npx underundre-clai-helpers add-target copilot
```

Полная документация CLI: [packages/cli/README.ru.md](packages/cli/README.ru.md)

### Маркетплейс плагинов

Устанавливайте тематические паки вместо полного шаблона:

```bash
# Добавить маркетплейс (внутри Claude Code)
/plugin marketplace add UnderUndre/under-ai-helpers

# Установить только нужное
/plugin install devx-core@underundre-ai
/plugin install spec-pipeline@underundre-ai
```

**8 доменных паков**: devx-core, spec-pipeline, backend, frontend, testing, security, ops, extras.

### Пресеты прав + Guard Hooks

```bash
# Применить пресеты прав (белый список для рутины, запрет для секретов)
npx underundre-clai-helpers presets apply

# Применить только statusline
npx underundre-clai-helpers presets apply --only statusline
```

Guard hooks (`.claude/hooks/*.mjs`) блокируют деструктивные команды и чтение секретов на уровне обёртки.

### Health Check

```bash
npx underundre-clai-helpers doctor          # Матрица здоровья
npx underundre-clai-helpers doctor --json   # Вывод в JSON
```

### Hermes Wrapper

```bash
npx underundre-clai-helpers hermes "prompt"              # Проброс промпта
npx underundre-clai-helpers hermes --background "prompt" # Фоновый режим
```

## Underboard: Память и Задачи

Автономный MCP-сервер, предоставляющий агентам общее состояние и долгосрочную память.

- **Task Board**: Управление задачами в стиле Kanban. Предотвращает дублирование работы в сессиях с несколькими агентами.
- **Семантическая память**: На базе Honcho v3 (основной семантический слой) с локальным FTS5 (лексический слой).
- **Dialog Capture**: Фаза 2 пайплайна инжеста. Автоматически захватывает, нормализует и анонимизирует диалоги для последующего поиска.
- **Адаптация и профилирование знаний**: Непрерывное обучение уровню экспертизы пользователя, динамическое регулирование глубины объяснений агента и безопасная синхронизация профилей с шифрованием AES-256-GCM.
- **Dashboard**: Локальный веб-интерфейс для визуализации задач и ленты памяти.

Подробнее: [packages/underboard/README.md](packages/underboard/README.md)

## Что синхронизируется

| Источник (`.claude/`) | Copilot (`.github/`) | Gemini (`.gemini/`) | Antigravity (`.agent/`) |
| --------------------- | ---------------------- | --------------------- | ------------------------- |
| `commands/*.md` | `prompts/*.prompt.md` | `commands/*.toml` | `workflows/*.md` |
| `agents/*.md` | `instructions/*.instructions.md` | `agents/*.md` | `agents/*.md` |
| `CLAUDE.md` | `copilot-instructions.md` | `GEMINI.md` | `AGENTS.md` |
| `skills/**/*` | -- (только Claude) | -- (только Claude) | `skills/**/*` |

7 встроенных трансформеров конвертируют форматы.

## Защищённые слоты

Проектный контент, который сохраняется при sync:

```md
<!-- HELPERS:CUSTOM START -->
Ваш контент. Никогда не перезаписывается при sync.
<!-- HELPERS:CUSTOM END -->
```

## Структура проекта

| Директория | Назначение |
| ----------- | ----------- |
| `.claude/commands/` | Slash-команды Claude Code (75 шт.) |
| `.claude/agents/` | Определения агентов-специалистов (27 шт.) |
| `.claude/skills/` | Переиспользуемые модули скиллов (43 шт.) |
| `packages/cli/` | npm-пакет `underundre-clai-helpers` |
| `packages/underboard/` | MCP-сервис памяти и задач |
| `specs/` | Спецификации, планы, контракты, задачи |
| `specs/main/` | **Каноничная архитектура и требования проекта** (для углублённого знакомства) |

## Разработка

```bash
cd packages/cli
npm install
npm test        # 302 теста
npm run build
```

См. [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

MIT
