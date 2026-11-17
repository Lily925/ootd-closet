# 오늘 뭐 입지? — AI Closet Coordinator

Solo project for the Web Programming course (SeoulTech, fall 2026).
Author: 비지야 벌얼사랑 (Computer Engineering, 22102548).
Deadline: final report due 2026-12-15. Weekly progress reports are required, so work is done in weekly steps.

## What the app does
A web app that recommends today's outfit from clothes the user has registered in their own closet, based on the current weather at their location. An AI model picks the combination and explains why. If the AI fails, a rule-based recommender is used instead.

## Hard constraints
- Vanilla HTML / CSS / JavaScript only. No React, Vue, jQuery, Tailwind, or frontend build tools.
- Multi-page site (separate .html files), not a single-page app.
- All UI text in Korean.
- Keep code readable for a student: clear names, short functions, comments explaining why. The author must be able to explain every file in the final report.
- Never put API keys in frontend code or commit them. Keys live in server/.env (gitignored). Provide server/.env.example.
- Make small, focused changes. Do not rewrite unrelated files.
- After each task, summarize what changed and suggest a git commit message.

## Pages
- index.html: start screen, service intro, today's weather preview, 시작하기 button
- main.html: today's weather + recommended outfit cards (top/bottom/outer/shoes) with reason, 다른 코디 보기
- closet.html: my clothes as cards, filter, search, edit, delete
- add.html: add clothing with photo, category, color, thickness, tags; optional AI auto-tagging
- history.html: wear history; recently worn items get lower priority

## Tech
- Frontend: HTML5, CSS3 (Flex, Grid, media queries, mobile-first), ES6, DOM, fetch/async-await
- Web APIs: Geolocation (fallback city select), FileReader, Canvas (resize photos), IndexedDB
- Server: Node.js + Express in server/, proxy for OpenWeatherMap and Gemini so keys stay secret
  - GET /api/weather, POST /api/recommend (returns item ids + Korean reason), POST /api/tag (optional)
- Hosting: frontend on GitHub Pages (https://lily925.github.io/ootd-closet/), server deployed separately (Render or Vercel)

## Recommendation rules
- AI result: validate every returned id exists in the closet; drop or replace invalid ones.
- AI timeout (~8s) or error → rule-based fallback in js/rules.js:
  - ≥28°C: thin top, thin bottom, no outer
  - 23–27: thin top, normal bottom
  - 17–22: normal top, light outer optional
  - 12–16: normal top, normal outer
  - 9–11: normal/thick top, thick-ish outer
  - ≤8: thick top, thick outer
  - Rain → prefer shoes/outer tagged for rain
- Avoid items worn in the last 3 days when alternatives exist.
- If the closet lacks a category, tell the user what's missing and give general advice.
