# Интеграция NETRA

NETRA является модулем визуализации топологии, а не источником инфраструктурных данных. В объединённой системе другие компоненты формируют снимок сети, а NETRA принимает его через JSON-файл или программный API.

## Канонический снимок

```json
{
  "schemaVersion": "1.0",
  "datasetId": "monitoring:stand-01",
  "name": "Учебный стенд 01",
  "source": "monitoring",
  "generatedAt": "2026-07-24T12:00:00Z",
  "nodes": [
    {
      "id": "container:web",
      "label": "web",
      "status": "alive",
      "meta": {
        "host": "student-host-01",
        "type": "container"
      }
    }
  ],
  "links": [
    {
      "source": "container:web",
      "target": "service:db",
      "load": 0.64,
      "meta": {
        "protocol": "tcp",
        "port": 5432
      }
    }
  ],
  "meta": {
    "stand": "stand-01"
  }
}
```

Обязательны только `nodes` и `links`. Поля `schemaVersion`, `datasetId`, `name`, `source`, `generatedAt` и `meta` необязательны. Дополнительные поля не мешают визуализации. Объекты `meta` узлов и связей передаются в Cytoscape и могут использоваться будущими панелями.

Идентификаторы должны быть стабильными строками. Для предотвращения совпадений рекомендуется добавлять пространство имён: `host:`, `container:`, `service:`. Статус визуализатора — `alive` или `dead`, нагрузка связи — число от `0` до `1`.

## Программный API

После загрузки страницы доступен модуль `window.NETRA.topology`. Общий объект `window.NETRA` остаётся расширяемым для модулей других команд:

```js
const snapshot = await fetch("/api/topology/stand-01").then(response => response.json());

NETRA.topology.openDataset(snapshot, {
  id: "monitoring:stand-01",
  name: "Учебный стенд 01",
  source: "monitoring",
  show: true
});
```

Повторный вызов с тем же `id` обновляет существующую вкладку. Если состав узлов и связей не изменился, их координаты и камера сохраняются.

Доступные методы:

- `NETRA.topology.openDataset(data, options)` — открыть или обновить снимок;
- `NETRA.topology.validateDataset(data)` — получить массив сообщений валидатора;
- `NETRA.topology.activateDataset(id, options)` — активировать вкладку;
- `NETRA.topology.closeDataset(id)` — закрыть вкладку;
- `NETRA.topology.getOpenDatasets()` — получить безопасную сводку открытых наборов.

События окна: `netra:topology:dataset-opened`, `netra:topology:dataset-updated`, `netra:topology:dataset-activated`, `netra:topology:dataset-closed`.

## Связь с другими кейсами

| Компонент | Способ интеграции |
|---|---|
| Docker Network Profiler | Экспортирует канонический снимок или использует адаптер отчёта профайлера в `nodes` и `links` |
| Генератор документации | Может читать тот же снимок; координаты `layout.positions` остаются необязательными |
| Сервис мониторинга | Получает данные, нормализует нагрузку и вызывает `NETRA.topology.openDataset` со стабильным `id` |
| Анализ качества данных | Проверяет снимок до передачи; встроенный валидатор NETRA остаётся последней неблокирующей проверкой |

## Граница модуля

Текущая версия не подключается к Docker, БД и REST сама, не выполняет авторизацию и не хранит временные ряды. Эти задачи остаются у профайлера, мониторинга и серверной части общей системы.

Безопасный вариант объединения сейчас — отдельный маршрут общей оболочки или `iframe`. При вставке в одну DOM-страницу с чужим интерфейсом потребуется следующий этап: префикс CSS-классов или Shadow DOM, перенос внутренних глобальных функций в ES-модули и передача темы от общей дизайн-системы. Публичный `window.NETRA.topology` уже отделяет обмен данными от этих внутренних деталей и не занимает namespace целиком.
