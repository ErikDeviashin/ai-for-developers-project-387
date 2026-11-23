# Версии и релизы

Версии ведёт [release-please](https://github.com/googleapis/release-please). Настройка описана здесь; конфигурация — `release-please-config.json`, `.release-please-manifest.json` и workflow `.github/workflows/release-please.yml`.

## Одна версия на репозиторий

- Версионируется только корневой путь `.`; `release-type: node`, поэтому единственный источник версии — поле `version` в корневом `package.json`.
- Один корневой `CHANGELOG.md`, один тег `vX.Y.Z` (без компонента в теге: `include-component-in-tag: false`) и один GitHub Release.
- Приватные пакеты `server`, `client` и `contract` не версионируются, не получают собственных тегов и changelog и не публикуются. Публикации в npm нет: release-please только обновляет файлы, создаёт тег и GitHub Release.

## Правила версий

- `fix` → patch, `feat` → minor.
- `bump-minor-pre-major: true`: до `1.0.0` ломающее изменение (`feat!`, `fix!`, `BREAKING CHANGE`) поднимает только minor.
- `bump-patch-for-minor-pre-major` выключен: `feat` до `1.0.0` остаётся minor, а не patch.
- Переход на `1.0.0` — отдельное будущее решение, сейчас его нет.

## Продолжение релизов

- Версия `0.1.0` выпущена в [исходном репозитории](https://github.com/ErikDeviashin/ai-for-developers-project-386/releases/tag/v0.1.0); новый репозиторий продолжает эту версию.
- `bootstrap-sha: f7eb4d8ab4ea6549f516c404a6ac7de245de5205` указывает на последний стартовый коммит нового репозитория до переноса приложения. Release-please учитывает последующие Conventional Commits, но не стартовый шаблон Hexlet.
- `.release-please-manifest.json` фиксирует текущую версию `0.1.0`; следующий релиз определяется коммитами после `bootstrap-sha`.

## Workflow

- Запускается только на push в `main`.
- Создаёт или обновляет один release PR и не включает автомерж: релиз происходит после ручного мержа этого PR, затем release-please создаёт тег `vX.Y.Z` и GitHub Release.
- Права workflow: `contents: write`, `issues: write`, `pull-requests: write`.
- release-please не входит в `pnpm check`: локальная и CI-проверка не создают релизы и не обращаются к GitHub.

## Токен для CI на release PR

По умолчанию release-please может работать на встроенном `GITHUB_TOKEN`, но события, созданные этим токеном, не запускают другие workflow. Поэтому обязательные проверки `CI` не появятся на release PR автоматически.

Чтобы существующий `ci.yml` запускался на release PR, workflow берёт секрет `RELEASE_PLEASE_TOKEN`, а при его отсутствии откатывается на `GITHUB_TOKEN`:

```yaml
token: ${{ secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN }}
```

Настройка (выполняется вручную владельцем репозитория, в коде секретов нет):

1. Создайте fine-grained personal access token только для этого репозитория с правами `Contents: read and write`, `Issues: read and write`, `Pull requests: read and write`. Эквивалент для classic token — scope `repo`. Вместо PAT можно использовать токен GitHub App с теми же правами.
2. Добавьте его в Settings → Secrets and variables → Actions под именем `RELEASE_PLEASE_TOKEN`.
3. В Settings → Actions → General разрешите GitHub Actions создавать pull requests.

Без секрета release PR всё равно создаётся, но проверки `CI` на нём не запустятся сами: их нужно запустить вручную (например, закрыть и снова открыть PR) или настроить пат/токен приложения.

## Откат

- Откат настройки — обычный revert коммита с конфигурацией и workflow. Force push не используется.
- Выпущенный тег и GitHub Release автоматически не удаляются: это отдельное ручное решение.
