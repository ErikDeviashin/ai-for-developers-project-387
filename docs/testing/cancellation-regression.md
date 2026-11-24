# Проверка чувствительности теста отмены встречи

Этот документ фиксирует, что регрессионный тест отмены встречи действительно
ловит нарушение правила, а после восстановления кода снова проходит.

## Защищаемое правило

**Встречу нельзя отменить после её начала.** Сервер удаляет встречу только при
совпадении `id` и email гостя и только если `start_ms > now`. После начала
встречи отмена возвращает `409 MEETING_ALREADY_STARTED`, а встреча и занятый
слот сохраняются.

Правило реализовано в `server/src/meetings.ts` в функции `cancelMeeting`, а
проверяется тестом:

```
server/test/cancel-meeting.test.ts > POST /meetings/{id}/cancel >
rejects a cancellation once the meeting has started and keeps it
```

## Точная команда целевого теста

```bash
pnpm --filter server exec vitest run test/cancel-meeting.test.ts -t "rejects a cancellation once the meeting has started and keeps it"
```

Ожидаемый зелёный результат в текущем `main`:

```
Test Files  1 passed (1)
     Tests  1 passed | 23 skipped (24)
```

## Воспроизводимая процедура red/green

Процедура выполняется в одноразовом незакоммиченном рабочем дереве. Сломанный
код не коммитится и не публикуется.

1. Убедитесь, что рабочее дерево чистое:

   ```bash
   git status --porcelain
   git rev-parse HEAD
   ```

2. Запустите целевой тест и зафиксируйте зелёный baseline:

   ```bash
   pnpm --filter server exec vitest run test/cancel-meeting.test.ts -t "rejects a cancellation once the meeting has started and keeps it"
   ```

   Ожидается `1 passed | 23 skipped`.

3. Временно нарушьте только правило начала встречи: в
   `server/src/meetings.ts` замените в `DELETE`-запросе функции `cancelMeeting`
   условие `AND start_ms > ?` на `AND start_ms <= ?`. Это разрешает удаление
   уже начавшейся встречи.

4. Запустите ту же команду из шага 2. Ожидаемое падение именно выбранного
   теста:

   ```
   FAIL  test/cancel-meeting.test.ts > POST /meetings/{id}/cancel > rejects a cancellation once the meeting has started and keeps it
   AssertionError: expected 204 to be 409 // Object.is equality
   - Expected
   + Received
   - 409
   + 204
   ```

   `204` означает, что мутация разрешила отмену начавшейся встречи, то есть
   тест поймал нарушение правила.

5. Полностью восстановите корректный код и убедитесь, что мутации нет:

   ```bash
   git checkout -- server/src/meetings.ts
   git diff --exit-code
   ```

   `git diff` должен быть пустым.

6. Повторно запустите ту же команду из шага 2 и зафиксируйте зелёный
   результат `1 passed | 23 skipped`.

## Границы

- Меняется только локальное незакоммиченное состояние `server/src/meetings.ts`;
  после проверки файл восстанавливается из Git.
- Production-код, API, схема БД, зависимости и сгенерированные файлы не
  меняются.
- Mutation-testing framework и автоматизация мутаций в CI не добавляются.
