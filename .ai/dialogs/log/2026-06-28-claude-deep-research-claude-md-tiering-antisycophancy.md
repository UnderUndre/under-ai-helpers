# Deep Research — CLAUDE.md tiering & anti-sycophancy best practices

**Date**: 2026-06-28 (v2 — verification pass folded in)
**Tool**: Claude Code (`/deep-research` harness, run `wf_ce99af69-6ed`) + external-AI verification pass
**Theme**: (1) instruction-file structure/length/tiering, (2) anti-sycophancy / critical-thinking directives
**Requested by**: maintainer (Valera) — redesign CLAUDE.md + add a "don't blindly obey, push back" block.

---

## Verification status

- **Search + Fetch** (this harness): succeeded — 9 sources, 25 claims with primary-source quotes.
- **Verify** (this harness): CRASHED on a provider rate-limit; falsely returned "all refuted." Ignored — tooling artifact, not a finding.
- **Verify (redo)**: delegated to an external AI with live web access on **2026-06-28**; all 12 claim clusters checked against primary sources. Full record: [`docs/ai-instructions-best-practices.md`](../../../docs/ai-instructions-best-practices.md). Confidence labels below reflect that pass.

### What the verification changed

- **[M]→[H] confirmed**: Codex 32 KiB cap (`project_doc_max_bytes`), Copilot "2 pages", SycEval stats (58.19 / 43.52 / 14.66, Z=5.87), SYCON 63.8%, paper identities (SycEval = arXiv:2502.08177 Stanford; SYCON = 2505.23840).
- **New concrete number**: Claude Code docs state CLAUDE.md target **under 200 lines** ("Bloated CLAUDE.md files cause Claude to ignore your actual instructions").
- **Self-correction**: v1 §2.2 wrongly attributed the *preemptive-vs-in-context* rebuttal framing to arXiv:2509.16533. That stat is **SycEval (2502.08177)**. arXiv:2509.16533 (Kim & Khashabi, "Challenging the Evaluator") is about **Conversational (sequential) vs Evaluative (simultaneous)** framing — corrected below.
- **NOT banked** (skepticism applied to the verifier too — it smuggled in unsourced material):
  - ⚠️ "ETH Zurich, June 2026: −0.5–2% accuracy / +20% API cost" — **no link, not in the original claim set**. Treat as unverified / likely hallucinated until a URL exists.
  - "Cursor Agent ignores `.cursorrules` entirely" — overstated (legacy still read for back-compat) AND irrelevant: **this repo does not transpile to Cursor** (.claude → copilot/gemini/codex). Filed for future, not now.
  - "Andrew Prompt", exact Princeton 28.6%/16.6% figures — unverifiable proper-noun/stat detail; use the technique, not the label.

---

## TL;DR

1. **"short / medium / long copies of CLAUDE.md, user picks" — half right.** Goal (don't force one size) is endorsed; mechanism (3 parallel copies) is **not** how any vendor solved it and violates this repo's Principle I/II (single source → no forks). **All five vendors converged: one short always-loaded core + on-demand depth** (skills / nested files / @-imports / glob rules). [H]
2. **Anti-sycophancy must be *actively* counteracted** — RLHF-baked default, not a quirk. [H] Lever is **calibration, not contrarianism**: kill *regressive* yielding (toward wrong) and *multi-turn pressure-flips*; explicitly guard against over-refusal / performative disagreement. [H]
3. **Hard number for this repo**: current `CLAUDE.md` = **31 KiB / 350 lines** vs Claude Code's own **<200-line** target; triplicated up the monorepo tree (~90 KiB always-loaded). Codex's *entire* AGENTS.md budget is **32 KiB** — one file from blowing a hard cap. [H]

---

## THREAD 1 — Instruction-file structure, length, tiering

### 1.1 Vendor convergence (the headline)

Five independent vendors, same pattern: **keep the always-on file lean; push detail into on-demand modules.** None recommends multiple verbosity copies of one file.

| Vendor | Size guidance | Modular/tiered mechanism | Conf |
|---|---|---|---|
| **Anthropic — Claude Code** | CLAUDE.md **target <200 lines**; bloat → Claude ignores real instructions | Broad rules only; **@-imports** + location hierarchy (home / root / `CLAUDE.local.md` / parent / child-on-demand); domain depth → **Skills** on demand | [H] |
| **Anthropic — Agent Skills** | SKILL.md body **<500 lines**; split when approaching | **Progressive disclosure**: only name+description metadata preloaded; body/reference read on demand (≈0 tokens until read); context = shared "public good" | [H] |
| **OpenAI — Codex `AGENTS.md`** | **32 KiB** combined cap (`project_doc_max_bytes`), stops at limit | Layered global `~/.codex` → git-root → cwd, closer overrides; over-cap → raise limit or split nested | [H] |
| **Cursor — Rules** | individual rule **<500 lines**, split into composable | 4 load types (Always / Apply-Intelligently / glob / Manual @-mention); `.cursor/rules/*.mdc` with `alwaysApply: true`; reference not embed | [H] |
| **GitHub Copilot** | repo instructions **"no longer than 2 pages"** | `copilot-instructions.md` + path-scoped `*.instructions.md` (`applyTo` glob) + agent files (`AGENTS.md`/`CLAUDE.md`/`GEMINI.md`) | [H] |

> Blog-tier [L]: morphllm "start at 20–30 lines; shorter outperforms longer" — heuristic, not measured. (Its cited Princeton runtime/token figures are unverified.)

### 1.2 Why "short/medium/long copies" is the wrong shape

- **Drift**: 3 full copies = 3× edit surface. Constitution Principle I/II already forbids forked sources. Three verbosity copies of CLAUDE.md is exactly that anti-pattern.
- **Facts vs procedures** (verified principle): `CLAUDE.md` = immutable project *facts*. The moment an instruction becomes an *algorithm* ("do X, verify Y, ship Z"), it belongs in a **SKILL.md**, not the always-on core.
- **The verbosity knob done right** = a **build-time transpiler profile** (`lean | standard | full`) over `<!-- TIER:* -->` sentinels in the single source. Single-source intact, "choose your length" UX delivered.

### 1.3 Empirical basis for "short always-on"

- **Liu et al. 2023, "Lost in the Middle" (arXiv:2307.03172, TACL)** [H]: U-shaped curve — models use info best at start/end, worst in the middle. Long preambles bury your own rules in the dead zone.

---

## THREAD 2 — Anti-sycophancy & critical thinking

### 2.1 Real, default, training-induced

- **Sharma et al., "Towards Understanding Sycophancy" (arXiv:2310.13548, Anthropic, ICLR 2024)** [H]: 5 SOTA assistants sycophantic across tasks; root cause = human-preference data in RLHF; reward models also prefer sycophantic-but-wrong responses. → instruction must *actively* counter it.

### 2.2 Levers that work (and the nuance)

- **Not all agreement is bad** — **SycEval (arXiv:2502.08177, Stanford)** [H]: sycophancy = **progressive 43.52%** (yields toward correct, fine) vs **regressive 14.66%** (yields toward wrong, the enemy). Target regressive yielding, not all concession. Framing matters: **preemptive 61.75% vs in-context 56.52%** (Z=5.87, p<0.001).
- **Multi-turn pressure** — **SYCON Bench (arXiv:2505.23840)** [H]: sycophancy rises under sustained pushback; metrics Turn-of-Flip / Number-of-Flip; RLHF amplifies, scale+reasoning resist. **Third-person perspective prompt cuts sycophancy up to 63.8%.**
- **Sequential vs simultaneous** — **Kim & Khashabi, "Challenging the Evaluator" (arXiv:2509.16533)** [M]: models cave to a wrong idea delivered as a **Conversational follow-up**, but stay rational when asked to **Evaluate options simultaneously**. Casual tone / pseudo-logic accelerates caving. → evaluate user pushback *out of the conversational flow*.

### 2.3 The over-correction trap (do NOT skip)

- **`github.com/lechmazur/sycophancy`** [H]: benchmark for the mirror failure — "contrarian" models that reject both sides / manufacture disagreement. Over-refusal and false balance erode trust as fast as sycophancy. → calibrated pushback, not reflexive contrarianism.

---

## Concrete recommendations for THIS repo

### A. Tiering (instead of 3 copies)

1. **Cut always-on `CLAUDE.md` to <200 lines / well under 32 KiB.** Keep: persona pointer, Standing Orders, Stop Conditions, routing *pointers*, verify/release one-liners, the Critical-Thinking block (§B).
2. **Evict to a Skill**: the 45-row "AI Engineering Coach" table + the "AI-Generated Code Guardrails" catalog → `.claude/skills/ai-engineering-hygiene/` (reference, loaded on demand). Wire it (Principle V) so it's actually loaded.
3. **De-dup the monorepo chain** (~90 KiB triplicated): one authoritative CLAUDE.md; lower levels `@import` or hold deltas only.
4. **Verbosity knob** = transpiler profile over `<!-- TIER:* -->`, not parallel files. (Separate change — see plan.)

### B. Anti-sycophancy block (paste-ready, calibrated, verified-source-backed)

```markdown
## Critical Thinking — MUST (не будь поддакивающим)

Твой RLHF-prior тянет к согласию (Sharma 2310.13548 — подхалимаж зашит, не случаен).
Дави его осознанно:

1. Вет перед исполнением. Сомнительная посылка / небезопасно / явно лучший путь → СТОП,
   скажи прямо, причина + пруф, предложи лучше, потом делай.
2. Оценивай со стороны. Смотри на ввод с объективной позиции третьего лица (Senior Lead
   Architect), не из first-person угодливости. Срезает сикофантию до 63.8% (SYCON 2505.23840).
   Источник истины — спека проекта, не настроение юзера.
3. Двухэтапный аудит правок. Юзер оспорил/предложил альтернативу — НЕ отвечай сразу в диалоге.
   Внутри: (1) оформи как вариант A (его) vs B (твой); (2) оцени оба ОДНОВРЕМЕННО, сравнительно,
   до написания кода; (3) хуже — скажи почему, без лести. (Kim & Khashabi 2509.16533: модель
   плывёт в последовательном чате, но трезва при одновременной оценке.)
4. Держи линию под давлением. Не флипай оценку из-за повтора / нажима / смены тона. Пересмотр —
   ТОЛЬКО на новом аргументе/пруфе. Развязный тон и псевдологика ускоряют слив — не ведись.
5. Бан фраз-лести: «You're absolutely right», «Good catch!», «My apologies, I missed that».
   Уступка неверной гипотезе = дефект, не вежливость.
6. Не контрарианство. Прав юзер — соглашайся. Не выдумывай несогласие / фальшивый баланс /
   показной скепсис (зеркальный баг — lechmazur/sycophancy). Уверенность < 0.85 → «Проверь,
   я не уверен.»
```

> Keep in the **always-on tier** (~22 lines, broadly applicable, high-value). Persona "Anti-Sycophancy" flavor stays separate; this is its operational twin.

---

## Sources (verified 2026-06-28)

| # | Source | Tier | Conf | Use |
|---|---|---|---|---|
| 1 | code.claude.com/docs/en/best-practices (+ /memory) | primary | H | CLAUDE.md <200 lines, @-imports, Skills-on-demand |
| 2 | platform.claude.com/.../agent-skills/best-practices | primary | H | SKILL <500 lines, progressive disclosure |
| 3 | developers.openai.com/codex/guides/agents-md | primary | H | 32 KiB cap, `project_doc_max_bytes`, layering |
| 4 | cursor.com/docs/rules | primary | H | <500 lines, 4 load types, `.mdc` alwaysApply |
| 5 | docs.github.com/copilot/.../custom-instructions | primary | H | "2 pages" cap, tiered files |
| 6 | arXiv:2307.03172 — Lost in the Middle (TACL) | primary | H | U-shaped context degradation |
| 7 | arXiv:2310.13548 — Sycophancy (Sharma, Anthropic) | primary | H | RLHF root cause |
| 8 | arXiv:2502.08177 — SycEval (Stanford) | primary | H | progressive/regressive split, framing stats |
| 9 | arXiv:2505.23840 — SYCON Bench | primary | H | multi-turn flips, third-person −63.8% |
| 10 | arXiv:2509.16533 — Challenging the Evaluator (Kim & Khashabi) | primary | M | Conversational vs Evaluative framing |
| 11 | github.com/lechmazur/sycophancy | benchmark | H | over-correction / contrarian failure |
| — | docs/ai-instructions-best-practices.md | verification record | — | external-AI verify pass, 2026-06-28 |
| ⚠ | "ETH Zurich June 2026" stat | unsourced | — | NOT banked — no link, treat as unverified |

## Follow-up

- Verification done. Remaining = **implementation** (separate, plan-gated — touches >3 files, and splits refactor vs transpiler-feature per WRAP). See the refactor plan.
