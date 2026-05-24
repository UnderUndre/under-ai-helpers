# AI Helpers

Коллекция промптов, агентов, скиллов и CLI-инструмент для AI-разработки. Пишешь один раз в формате Claude — синхронизируешь в GitHub Copilot и Google Gemini автоматически.

[English version](README.md)

## Что внутри

```
.claude/          # Источник истины: команды, агенты, скиллы
.github/          # Copilot промпты и инструкции (авто-генерация)
.gemini/          # Gemini команды и агенты (авто-генерация)
packages/cli/     # CLI-инструмент для транспиляции
specs/            # Спецификации и дизайн-документы
```

## CLI: `clai-helpers`

Ядро репозитория. Берёт `.claude/` как единый источник истины и транспилирует в форматы Copilot и Gemini.

### Установка в проект

```bash
npx clai-helpers init --source github:UnderUndre/ai
```

Генерирует `.claude/`, `.github/prompts/`, `.github/instructions/`, `.gemini/commands/`, `.gemini/agents/`, `CLAUDE.md`, `GEMINI.md` и `helpers-lock.json`.

### Обновление

```bash
npx clai-helpers sync --upgrade
```

### Проверка дрифта в CI

```bash
npx clai-helpers status --strict
# Код выхода 2 = кто-то руками отредактировал управляемый файл
```

### Выборочные таргеты

```bash
# Только Claude (без Copilot/Gemini)
npx clai-helpers init --source github:UnderUndre/ai --targets claude

# Добавить Copilot позже
npx clai-helpers add-target copilot
```

Полная документация CLI: [packages/cli/README.ru.md](packages/cli/README.ru.md)

## Что синхронизируется

| Source (`.claude/`) | Copilot (`.github/`) | Gemini (`.gemini/`) |
|---------------------|----------------------|---------------------|
| `commands/*.md` | `prompts/*.prompt.md` | `commands/*.toml` |
| `agents/*.md` | `instructions/*.instructions.md` | `agents/*.md` |
| `CLAUDE.md` | `copilot-instructions.md` | `GEMINI.md` |
| `skills/**/*` | -- (только Claude) | -- (только Claude) |

7 встроенных трансформеров конвертируют форматы. Кастомные трансформеры можно добавить для других таргетов (Cursor, Windsurf и др.).

## Защищённые слоты

Проектный контент, который сохраняется при sync:

```md
<!-- HELPERS:CUSTOM START -->
Ваш контент. Никогда не перезаписывается при sync.
<!-- HELPERS:CUSTOM END -->
```

## Структура проекта

| Директория | Назначение |
|-----------|-----------|
| `.claude/commands/` | Slash-команды Claude Code (53 шт.) |
| `.claude/agents/` | Определения агентов-специалистов (27 шт.) |
| `.claude/skills/` | Переиспользуемые модули скиллов (160 файлов) |
| `packages/cli/` | npm-пакет `clai-helpers` |
| `specs/` | Спецификации, планы, контракты, задачи |

## Разработка

```bash
cd packages/cli
npm install
npm test        # 128 тестов
npm run build
```

См. [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

MIT
