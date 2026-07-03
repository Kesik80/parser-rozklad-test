# Парсер розкладу

PWA-інструмент для парсингу розкладу електричок з swrailway.gov.ua

## Структура

```
├── index.html              # Головна сторінка
├── pwa-install.js          # Модуль встановлення PWA
├── sw.js                   # Service Worker
├── manifest.json           # PWA маніфест
├── vercel.json             # Налаштування Vercel
├── icons/                  # Іконки (додай з Icon Forge)
│   ├── icon-192x192.png
│   ├── icon-512x512.png
│   └── icon-maskable-512.png
└── api/
    ├── fetch-timetable.js  # Парсинг розкладу поїзду (через ScrapingBee)
    └── fetch-station.js    # Отримання списку поїздів станції

## Деплой на Vercel

1. Створи репозиторій на GitHub
2. Підключи до Vercel
3. Додай змінну оточення: `SCRAPINGBEE_KEY` = твій ключ ScrapingBee
4. Деплой автоматичний при пуші в main

## Встановлення на телефон

Відкрий сайт у Chrome на Android → з'явиться банер «Додати на екран»
```
