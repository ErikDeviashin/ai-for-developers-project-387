# Календарь звонков (продолжение)

[![hexlet-check](https://github.com/ErikDeviashin/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/ErikDeviashin/ai-for-developers-project-387/actions)

Упрощённый сервис бронирования времени по мотивам Cal.com: владелец публикует типы встреч и доступное время, а гость без регистрации выбирает свободный слот и записывается на звонок.

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## История проекта

Это продолжение проекта из репозитория [ai-for-developers-project-386](https://github.com/ErikDeviashin/ai-for-developers-project-386). Исходные продуктовые решения зафиксированы в [карте решений](https://github.com/ErikDeviashin/ai-for-developers-project-386/issues/1), а согласованные требования — в [спецификации сервиса бронирования](https://github.com/ErikDeviashin/ai-for-developers-project-386/issues/16). Архитектурные решения перенесены в [`docs/adr/`](docs/adr/).

## Сценарий использования

1. Владелец создаёт тип встречи: название, описание и длительность.
2. Гость выбирает тип встречи, дату и свободный слот.
3. Гость указывает обязательные имя и email, а также при желании дополнительную информацию.
4. После успешного бронирования гость возвращается в календарь и видит созданную встречу.
5. Встреча появляется в списке владельца с типом встречи и данными гостя.

## Правила бронирования

- Владелец один; авторизации и интеграций с внешними календарями нет.
- Часовой пояс владельца — `Asia/Tbilisi`.
- Рабочие дни — понедельник–пятница.
- Рабочие часы — 10:00–18:00.
- Окно бронирования — ближайшие 14 календарных дней, начиная с завтрашнего дня.
- Доступные старты идут с шагом 30 минут.
- Встреча должна полностью помещаться в рабочие часы.
- Длительность слота равна длительности типа встречи.
- Любые пересечения запрещены, в том числе между разными типами встреч.
- Встречи могут идти встык.
- Два одновременных запроса не должны создавать две пересекающиеся записи.

## Стек

- React, Vite, TypeScript.
- Fastify, TypeScript.
- TypeSpec → OpenAPI → `@hey-api/openapi-ts`.
- SQLite через встроенный модуль Node.js `node:sqlite`.
- Vitest и Playwright.
- pnpm и Node.js 24.

## Установка

```bash
git clone https://github.com/ErikDeviashin/ai-for-developers-project-387.git
cd ai-for-developers-project-387
pnpm install --frozen-lockfile
```

Отдельные переменные окружения не нужны: сервер по умолчанию использует `PORT=3000`, `HOST=127.0.0.1` и файл `calendar.sqlite`.

## Использование

```bash
pnpm dev
```

Команда запускает сервер и клиент. Клиент доступен на http://localhost:5173, API — на http://127.0.0.1:3000. Страницы: `/` — главная, `/book` — запись гостя, `/owner` — страница владельца по прямому URL.

`pnpm check` выполняет единую проверку: формат, дрейф контракта, линт, серверные и браузерные тесты, сборку.

## OpenCode в GitHub

В репозитории три независимые автоматические роли: интерактивный developer task, независимое авторевью pull request и обычный CI. Отдельно от них браузерное evidence проверяет именно head SHA pull request.

### Интерактивный developer task и автотриаж

OpenCode запускается в GitHub Actions по команде `/oc` или `/opencode` в начале нового комментария к issue, pull request или отдельной строке ревью. После команды должен идти пробел и текст задания либо комментарий должен состоять только из команды. Команду может выполнить только владелец репозитория, участник организации или коллаборатор; комментарии ботов игнорируются. Для pull request из форка шаг с секретом не запускается, а origin проверяется как same-repository.

Workflow устанавливает официальный OpenCode CLI фиксированной версии `1.19.6` и запускает `opencode github run` напрямую. Обёртка `anomalyco/opencode/github@latest` не используется: её неаутентифицированный запрос к GitHub Releases может исчерпать лимит API до запуска агента. Этот способ сохраняет стандартную авторизацию через OpenCode GitHub App и те же сценарии работы из комментариев.

Агент использует модель `opencode/deepseek-v4.1-flash` и секрет репозитория `OPENCODE_API_KEY`. В `opencode.json` публикация сессий явно отключена (`share: disabled`), а та же доступная модель назначена для служебных задач через `small_model`, чтобы OpenCode не обращался к недоступной модели заголовков. Один запуск ограничен 60 минутами, а команды для одного issue или pull request выполняются последовательно. Результат появляется ответом OpenCode в соответствующем обсуждении; состояние и журнал запуска доступны во вкладке Actions.

Событие `issues` с типом `opened` автоматически запускает OpenCode, если issue открыл доверенный автор с `author_association` `OWNER`, `MEMBER` или `COLLABORATOR`. Issues с меткой `ready-for-agent` пропускаются и повторный триаж не проходят. Комментарии запускают агента только по явной команде. Автотриаж новых issues в бюджет интерактивных PR-запусков не входит.

Агент читает новое обращение, существующее приложение и документы из `docs/agents/`, затем выполняет навык `triage`: оставляет в issue разбор, рекомендацию и недостающие вопросы и выставляет канонические метки из [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md) — `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` или `wontfix`, а также категорию `bug` или `enhancement`. Код он не меняет и реализацию не начинает; `to-spec`, `to-tickets` и `implement-spec` автоматически не запускаются.

### Бюджет интерактивных PR-запусков

На один pull request допускается не более трёх интерактивных запусков модели. Считаются комментарии к PR и inline review comments. Валидная trusted-human команда `/oc` или `/opencode` получает детерминированный `run-name` `OpenCode PR #<N> interactive`; invalid comments, bot comments, issue-команды и автотриаж получают другие имена и не попадают в PR-бюджет. Same-repo origin check выполняется до budget check: для fork budget и model run не запускаются.

`Check interactive run budget` читает историю именно workflow `opencode.yml` через GitHub Actions API, фильтрует runs по точному `display_title` текущего PR и событиям `issue_comment`/`pull_request_review_comment`, затем суммирует `run_attempt` каждого run. Текущий run/attempt также входит в сумму: если API его уже вернул, он учитывается один раз, если ещё не вернул — добавляется `context.runAttempt`. Поэтому cancellation, timeout и каждый Re-run/run attempt расходуют попытку, а четвёртая попытка получает `limit_exhausted` до checkout, установки и model run. В части Actions токен модели имеет только `actions: read` и не может менять историю Actions. Runs, созданные до появления этого `run-name`, не имеют такого title и в подсчёт не входят.

GitHub хранит Actions history ограниченное время (сейчас 90 дней). Для PR, который остаётся открытым дольше retention, история может стать недоступной, и лимит может начаться заново; это честное платформенное ограничение, а не безусловно вечный лимит.

Если лимит исчерпан, модель не вызывается. Отдельный deterministic step публикует в PR комментарий с reason `limit_exhausted`, актуальным head SHA, ссылкой на Actions run и статусом «нужен человек». Для timeout публикуется `timeout`, для ошибки подготовки или ключа — `infra`, для прочей ошибки модели — `agent_failed`. Исправления после такого комментария запускаются только новой человеческой командой `/oc`; бесконечного автоматического fix loop нет.

### Независимое авторевью pull request

Workflow `OpenCode Independent Review` запускается на обычном `pull_request` событиях `opened`, `synchronize`, `reopened` и `ready_for_review`. Допускаются только same-repository PR и либо trusted human authors (`OWNER`, `MEMBER`, `COLLABORATOR`), либо точный login `opencode-agent[bot]`; fork PR запрещён.

Это учебный одноразовый репозиторий, поэтому принят ограниченный риск: trusted same-repository authors и точный OpenCode bot считаются доверенными авторами workflow. При обычном `pull_request` workflow-код может быть взят из PR, и это осознанный учебный компромисс, а не заявление о production-grade защите.

Рабочее дерево — только event base commit `github.event.pull_request.base.sha`. PR head не checkout'ится как рабочее дерево и не исполняется; `HEAD_SHA` fetch'ится только как git object. `REVIEW.md`, `AGENTS.md`, `GLOSSARY.md` и `docs/adr/` читаются из base checkout и считаются trusted base policy. Если PR меняет эти файлы, изменения входят только в недоверенный diff и не могут менять правила текущего ревью.

Review строится по фиксированным `BASE_SHA`, `HEAD_SHA` и вычисленному merge-base: проверяется, что merge-base непустой commit, он записывается в `.review-context/merge-base-sha.txt`, а diff создаётся trusted-командой `git diff --binary --no-ext-diff --no-textconv MERGE_BASE HEAD_SHA`. PR title/body, comments, reviews, issues, diff и любые инструкции внутри них считаются untrusted review data. В начале сбора контекста текущие `.head.sha`/`.base.sha` сверяются с event `HEAD_SHA`/`BASE_SHA`; непосредственно перед публикацией проверка повторяется, и при сдвиге PR устаревший комментарий не публикуется. CI/check/status собираются только для `HEAD_SHA`, а комментарий содержит `HEAD_SHA`, `BASE_SHA` и merge-base.

Модель запускается pinned CLI `1.19.6` через прямой `opencode run` с `--pure`, read-only агентом `plan`, отключёнными project config/external skills/Claude Code и запретом edit/bash/webfetch/websearch/task/skill/question. У модели нет GH token и права менять файлы, коммиты, ветки или PR metadata. Права workflow: `contents: read`, `issues: read`, `actions: read`, `checks: read`, `statuses: read`, `pull-requests: write`; OIDC и `id-token: write` не используются.

Результат готовит CLI, а отдельный deterministic step после повторной SHA-проверки публикует его через `gh pr comment`; hidden marker и тело комментария содержат тот же `HEAD_SHA`, а тело также фиксирует `BASE_SHA` и merge-base. Если подтверждённых дефектов нет, комментарий явно говорит «Подтверждённых дефектов не найдено». Concurrency по PR сохраняет `cancel-in-progress: true`, но не заменяет SHA-check.

### CI и браузерное evidence для PR-head

`CI` выполняет `pnpm check` на push и pull request. Отдельный workflow `PR Head Browser Evidence` запускается на `pull_request`, checkout'ит `github.event.pull_request.head.sha` (не merge ref), записывает `git rev-parse HEAD` и ожидаемый event head SHA и проверяет их равенство. Затем он ставит frozen dependencies и Chromium, прогоняет полный текущий Playwright e2e набор с принудительным `--trace on`.

Evidence manifest и status создаются в `RUNNER_TEMP` до checkout, поэтому artifact создаётся даже при раннем падении checkout, install, Chromium или Playwright. `traces`, `test-results` и HTML report попадают в artifact только если Playwright успел их произвести; иначе `status.txt` и `manifest.txt` явно пишут `not_produced`, стадию и причину. Playwright output при наличии копируется в `playwright/` внутри evidence artifact. Обязательные `status.txt` и `manifest.txt` проверяются отдельным шагом; их отсутствие валит job, а не маскируется.

Artifact называется `browser-evidence-pr-<N>-sha-<head-sha>-attempt-<attempt>` и хранится 14 дней. В нём лежат `status.txt`, `manifest.txt`, `actual-head-sha.txt` и, когда созданы, Playwright traces/results и HTML report в `playwright/`. Model/API secrets в этом workflow нет.

### Где смотреть результат

- Независимое ревью — комментарий в обсуждении PR.
- CI — вкладка Checks и статусы обязательных проверок.
- Ход интерактивных запусков, автотриажа и ревью — вкладка Actions.
- Браузерное evidence — Artifacts соответствующего PR Head Browser Evidence run.

Чтобы сверить artifact с текущим PR head, сравните `actual_head_sha` и `expected_head_sha` из `status.txt` artifact с `gh pr view <N> --json headRefOid --jq .headRefOid`. SHA в имени artifact и в review comment должен совпадать с этим значением.

### Решение человека, branch protection и настройки

Ревью и CI дают входные данные, но не заменяют решение человека. Исправления запускаются только новой человеческой командой `/oc`, а merge выполняется только после ручного решения человека.

Branch protection сейчас не настроена. Её нужно включить после того, как имена стабильных проверок станут известны; до этого ограничение фиксируется в PR. Настройка GitHub «Allow GitHub Actions to create and approve pull requests» сейчас выключена. Release-please использует `RELEASE_PLEASE_TOKEN`, когда он доступен, поэтому эту настройку не нужно менять автоматически.

### Настройка интеграции

Для работы интеграции нужно установить [OpenCode GitHub App](https://github.com/apps/opencode-agent) только на этот репозиторий и добавить ключ OpenCode Console в Actions secret `OPENCODE_API_KEY`. Ключ не должен попадать в файлы репозитория или комментарии. На чистом runner агент получает инструкции из `AGENTS.md`, настройки GitHub issues из `docs/agents/` и навыки `to-spec`, `to-tickets`, `implement-spec` и `triage` из `.agents/skills/`.

Проверка интеграции: создайте тестовый issue и оставьте доверенным пользователем комментарий `/oc explain this issue`. Успешный запуск должен появиться в Actions и завершиться ответом агента в issue.

## Регулярный аудит доступности

Workflow `Scheduled Availability Audit` (`.github/workflows/scheduled-availability-audit.yml`) раз в сутки проверяет опубликованное приложение и заводит issue только на новые находки.

### Расписание и запуск

Workflow запускается по cron `17 2 * * *` — это 02:17 UTC, то есть 06:17 по `Asia/Tbilisi` (UTC+4 круглый год, перехода на летнее время нет). Кроме расписания доступен ручной запуск через `workflow_dispatch`.

Ручной запуск:

1. Откройте вкладку Actions репозитория.
2. Выберите workflow `Scheduled Availability Audit`.
3. Нажмите `Run workflow`, выберите ветку `main` и при необходимости измените `use_training_finding`.
4. Дождитесь завершения запуска и откройте artifact с отчётом.

Параметр `use_training_finding` (у ручного запуска по умолчанию включён, при плановом запуске — нет) добавляет в отчёт учебную находку. Она нужна только для проверки всей цепочки «отчёт → агент → issue → сверка дедупликации» и не является подтверждённым дефектом приложения.

### Настройка

В Settings → Secrets and variables → Actions нужны:

- repository variable `APP_URL` — базовый URL опубликованного приложения. Переменная обязательна: первый шаг workflow проверяет её наличие и схему `http://` или `https://` и падает с понятной ошибкой.
- repository secret `OPENCODE_API_KEY` — ключ OpenCode, тот же, что используют остальные workflow репозитория.

Значения переменной и секрета не хранятся в файлах репозитория, не выводятся в лог и не попадают в отчёт.

### Что делает запуск

1. `curl` запрашивает главную страницу `APP_URL`: ожидаются HTTP 200 и текст «Календарь звонков». Ошибка сети или не-200 не обрывают job — они попадают в отчёт отдельной находкой.
2. Детерминированный шаг формирует `.audit-output/audit-report.md` и снимает снапшот всех открытых и закрытых issues с количеством совпадений по каждому `audit-key`. Каталог `.audit-output/` в `.gitignore`, отчёты в Git не коммитятся.
3. Агент OpenCode читает отчёт и снапшот и создаёт issue только для находки, которой ещё нет. Маркер `audit-key: <value>` пишется в тело issue отдельной строкой; существующие issues не комментируются и не меняются.
4. Отдельный шаг сверяет количество issues по каждому ключу до и после агента: `0 → 1` и `N → N` считаются успехом, `0 → 0` и `N → N+1` валят job.
5. Отчёт всегда загружается artifact'ом `availability-audit-<run_id>-<run_attempt>` (хранение 14 дней) даже при падении агента или сверки и дублируется в job summary. Права workflow — `contents: read` и `issues: write`; агенту запрещены edit/write/patch/webfetch/websearch/task/skill.

### Проверенные запуски и защита от дублей

Проверены два ручных запуска. Планового cron-запуска пока не ожидали, поэтому его результат ещё не подтверждён.

| Запуск                                                                                                 | Результат                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [45290139724](https://github.com/ErikDeviashin/ai-for-developers-project-387/actions/runs/45290139724) | создан issue [#12](https://github.com/ErikDeviashin/ai-for-developers-project-387/issues/12), сверка `before=0 after=1` |
| [45290417668](https://github.com/ErikDeviashin/ai-for-developers-project-387/actions/runs/45290417668) | дубликат не создан, сверка `before=1 after=1`                                                                           |

Второй запуск с теми же данными оставил существующую issue без изменений: агент видит ненулевой счётчик по `audit-key` и не создаёт новую, а сверка подтверждает, что число issues не изменилось.

### Выводы

Полезнее всего оказалось разделение детерминированной проверки и агентного анализа: `curl` и `jq` дают воспроизводимый отчёт и точный список ключей, а модель только формулирует issue по уже готовым данным. Поэтому повторный запуск не зависит от того, как агент «увидел» страницу.

Сложнее всего было обеспечить идемпотентность. Пришлось ввести стабильные `audit-key`, снимать снапшот issues до запуска агента, требовать маркер отдельной строкой и отдельным шагом сверять счётчики до и после — без этой сверки дубликат заметил бы только человек.

Проверка намеренно ограничена главной страницей: отказ `/book` или `/owner` она не увидит. Для реального проекта я бы расширил её на эти маршруты с отдельными `audit-key`. Учебная находка про это ограничение — материал для проверки пайплайна, а не подтверждённый дефект приложения.

## Запуск в Docker

```bash
docker build -t calendar:local .
docker run --rm -p 3000:3000 calendar:local
```

Образ собирает клиент и сервер и запускает один процесс на `0.0.0.0:$PORT` (по умолчанию `3000`). Fastify отдаёт API и собранный React на одном origin. Произвольный порт задаётся через `PORT`:

```bash
docker run --rm -p 8080:8080 -e PORT=8080 calendar:local
```

Smoke-проверки:

```bash
curl -fsS http://127.0.0.1:3000/health
for path in / /book /owner; do
  curl -fsS -H 'Accept: text/html' "http://127.0.0.1:3000$path" > /dev/null
done
```

SQLite хранится в `/data/calendar.sqlite`. Без volume данные теряются при пересоздании контейнера. Для сохранения между запусками:

```bash
docker volume create calendar-data
docker run --rm -p 3000:3000 -v calendar-data:/data calendar:local
```

## Render

Сервис развёрнут вручную в одном Docker-контейнере. На бесплатном Render без persistent disk используется эфемерная файловая система: SQLite-файл `/data/calendar.sqlite` не гарантированно сохраняется и сбрасывается при перезапуске или новом деплое. После простоя сервис может засыпать, поэтому первый запрос бывает медленнее.

### Render MCP в OpenCode

Render MCP не поддерживает dynamic client registration для OpenCode, поэтому подключение идёт через API-ключ Render. Ключ создаётся в Render Account settings → API Keys.

В `opencode.json` уже задан remote-сервер `render` с заголовком `Authorization: Bearer {env:RENDER_API_KEY}`. Сам ключ в конфигурацию не записывается.

Ключ передаётся процессам OpenCode через окружение macOS, а не через запуск OpenCode из терминала. На macOS:

1. Скрыто прочитайте ключ в локальную переменную:

```bash
read -s RENDER_API_KEY
```

2. Передайте значение процессам, запускаемым через `launchd`, и сразу удалите локальную переменную:

```bash
launchctl setenv RENDER_API_KEY "$RENDER_API_KEY"
unset RENDER_API_KEY
```

3. Полностью перезапустите OpenCode вместе с его фоновым сервером.
4. Выполните `/reload` и проверьте подключение командой `/mcp`.

Не вставляйте значение ключа вручную в команды, `opencode.json` или историю shell: в примерах используется только имя переменной. После окончания работы удалите значение из окружения и снова перезапустите OpenCode:

```bash
launchctl unsetenv RENDER_API_KEY
```

Сервис был создан вручную; MCP добавляется для соответствия проектной конфигурации и дальнейшего управления, а не как подтверждение уже выполненного через MCP деплоя.

### Ручная проверка

1. На `/owner` создайте тип встречи.
2. На `/book` выберите тип, дату и свободный слот, заполните имя и email и создайте бронирование.
3. Убедитесь, что встреча появилась в списке на `/owner`.
4. Попробуйте забронировать тот же интервал повторно — сервис должен отклонить запрос.

## Демонстрация

Публичный сервис: https://ai-for-developers-project-386-66kz.onrender.com

Ссылка на asciinema будет добавлена позже.

## Статус проекта

Первый вертикальный срез реализован: владелец публикует типы встреч, гость выбирает тип, дату и свободный слот и создаёт встречу, а владелец видит текущие и предстоящие встречи. Правила доступности, конфликт слотов и API покрыты серверными тестами, полный гостевой путь — браузерным сценарием на реальных Fastify и Vite.

## Версии и релизы

Версия одна на репозиторий: корневой `CHANGELOG.md`, тег `vX.Y.Z` и один GitHub Release. Приватные пакеты `server`, `client` и `contract` не версионируются и не публикуются в npm.

Релизы ведёт release-please: на push в `main` он создаёт или обновляет один release PR без автомержа, а после ручного мержа создаёт тег и GitHub Release. Первый релиз — `0.1.0`. Настройка и токен для запуска CI на release PR описаны в [docs/release.md](docs/release.md).

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
