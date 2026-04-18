# Contributing to ArenaIQ Smart Venue Platform

Thank you for your interest in contributing! This guide explains how to get started and what we expect from contributions.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Branch Naming](#branch-naming)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Checklist](#pull-request-checklist)
- [Commit Messages](#commit-messages)
- [Reporting Bugs](#reporting-bugs)

---

## Getting Started

```bash
# 1. Fork the repository and clone your fork
git clone https://github.com/<your-username>/ArenalQ-PRO.git
cd ArenalQ-PRO

# 2. Install dev dependencies
npm install

# 3. Start the local dev server
npm start          # → http://localhost:8000

# 4. Run all tests
npm test

# 5. Lint the code
npm run lint
```

---

## Branch Naming

Use the following prefixes:

| Prefix     | Purpose                           | Example                        |
|------------|-----------------------------------|--------------------------------|
| `feat/`    | New feature                       | `feat/dark-mode-toggle`        |
| `fix/`     | Bug fix                           | `fix/zone-card-overflow`       |
| `docs/`    | Documentation only                | `docs/update-readme`           |
| `chore/`   | Build / tooling changes           | `chore/update-jest-config`     |
| `test/`    | Tests only                        | `test/crowd-monitor-edge-cases`|
| `refactor/`| Code refactor (no behavior change)| `refactor/extract-theme-module`|

---

## Development Workflow

1. Create a branch from `main`.
2. Make your changes in small, focused commits.
3. Ensure all tests pass and lint is clean before pushing.
4. Open a pull request targeting `main`.

---

## Code Style

- **ES Modules** — all `js/` files use `import`/`export`. No CommonJS.
- **No `eval`** — enforced by ESLint (`no-eval`, `no-implied-eval`).
- **XSS safety** — all untrusted strings go through `escapeHtml()` before `innerHTML`.
- **`sanitizeZoneId()`** — use for any string used in DOM IDs or Firestore paths.
- **No hardcoded secrets** — read values from `window.__ARENAIQ_CONFIG__` via `config.js`.
- **WCAG 2.1 AA** — all new interactive elements need keyboard support and ARIA attributes.
- Comments should explain *why*, not *what*.

Run the linter before committing:

```bash
npm run lint:fix
```

---

## Testing

Tests live in `tests/` and use **Jest + jsdom**.

```bash
npm test                # run all suites
npm run test:coverage   # with coverage (≥70% line threshold enforced)
```

- All new modules should have a corresponding `tests/<module>.test.js`.
- Cover happy paths, edge cases, and error paths.
- Do **not** modify unrelated existing tests.

---

## Pull Request Checklist

Before marking a PR as ready for review:

- [ ] All tests pass (`npm test`)
- [ ] Lint passes (`npm run lint`)
- [ ] Coverage does not drop below 70% (`npm run test:coverage`)
- [ ] New functionality has tests
- [ ] No hardcoded secrets or API keys
- [ ] Accessibility: new interactive elements have ARIA labels and keyboard support
- [ ] Updated docs / README if the public interface changed

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(dashboard): add dark mode toggle with localStorage persistence
fix(crowd-monitor): prevent negative density values in simulator
docs(readme): add fan.html quick-start instructions
```

---

## Reporting Bugs

Open a GitHub Issue and include:

1. Steps to reproduce
2. Expected behaviour
3. Actual behaviour
4. Browser / OS version
5. Relevant console errors

---

Thank you for helping make ArenaIQ better! 🏟️
