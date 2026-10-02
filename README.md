# Scene Clock for SillyTavern

**English · [Русский](#русский)**

Tells the bot the current date, time and location on every message — without typing it by hand.
The information goes into the prompt only; nothing is added to the chat messages. No extra requests to the model are made.

## Features
- **Real time** — the bot gets your computer's clock (time zone can be changed).
- **Your time** — set any date and time; it keeps ticking by itself from that point, like a real clock. Date and time are one value, so the date rolls over at midnight automatically.
- Quick buttons: **Now**, **+15 min**, **+1 hour**, **+1 day**.
- **Location** field with your 5 most recent locations.
- **Message times:** the time of each message is saved when it is sent / received (not in the text). The bot is told when your messages were written since its last reply, when its previous reply was sent, and how much time has passed.
- **Live preview** of exactly what is sent to the bot.
- Time and location are stored **per chat**.
- Switching to real time pauses "your time"; switching back resumes from where it stopped.
- **Echo removal:** if the model repeats the injected lines in its reply, they are cut out of the bot's message automatically (only whole lines matching the template). A button cleans the current chat's history too.
- English and Russian interface.
- Optional macros: `{{clock_time}}`, `{{clock_date}}`, `{{clock_weekday}}`, `{{clock_location}}`.

## Install
In SillyTavern: **Extensions → Install extension** → paste the URL of this repository.

## Notes
- "Your time" ticks in real time, including while SillyTavern is closed. Use **Now** or the +buttons to correct it.
- The extension skips quiet (background) generations.
- Messages sent before version 0.2.0 have no saved time and are simply skipped.
- Advanced settings (collapsed): message template, role, insert depth, time zone, language.

## Adding a language
1. Copy `locales/ru.json` to `locales/<name>.json` and translate the values (keys are the English strings).
2. Add the language to `locales/_manifest.json` with its file name and date locale (e.g. `de-DE`).

---

## Русский

Сообщает боту текущие дату, время и локацию в каждом сообщении — не нужно вписывать их вручную.
Данные уходят только во внутренний промпт, в самих сообщениях чата ничего не появляется. Дополнительных запросов к модели нет.

### Возможности
- **Реальное время** — бот получает часы вашего компьютера (часовой пояс можно изменить).
- **Своё время** — задайте любую дату и время, дальше они идут сами, как настоящие часы. Дата и время хранятся одним значением, поэтому в полночь дата меняется сама.
- Быстрые кнопки: **Сейчас**, **+15 мин**, **+1 час**, **+1 день**.
- Поле **«Локация»** и список из 5 последних локаций.
- **Время сообщений:** время каждого сообщения запоминается при отправке/получении (не в тексте). Бот знает, когда написаны твои сообщения после его последнего ответа, когда был его предыдущий ответ и сколько времени прошло.
- **Предпросмотр** того, что именно уходит боту.
- Время и локация хранятся **отдельно для каждого чата**.
- При переходе на реальное время «своё время» замирает, при возврате продолжается с того же места.
- **Удаление повторов:** если модель повторила вставленные строки в своём ответе, они автоматически вырезаются из сообщения бота (только строки, целиком совпадающие с шаблоном). Кнопка очищает и историю текущего чата.
- Интерфейс на русском и английском.
- Необязательные макросы: `{{clock_time}}`, `{{clock_date}}`, `{{clock_weekday}}`, `{{clock_location}}`.

### Установка
В SillyTavern: **Extensions → Install extension** → вставьте ссылку на этот репозиторий.

### Заметки
- «Своё время» идёт по реальным часам, в том числе когда SillyTavern закрыта. Поправить можно кнопкой **«Сейчас»** или кнопками «+».
- Тихие (фоновые) генерации расширение пропускает.
- У сообщений, отправленных до версии 0.2.0, нет сохранённого времени, они просто пропускаются.
- «Дополнительно» (свёрнуто): шаблон сообщения, роль, глубина вставки, часовой пояс, язык.
