const path = require('path');
const dotenv = require('dotenv');
const express = require('express');

dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const PORT = process.env.PORT || 3000;
const OWM_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const OWM_TIMEOUT_MS = 8000;
const ROOT = path.join(__dirname, '..');
const PAGES = ['index', 'main', 'closet', 'add', 'history'];

const app = express();
app.disable('x-powered-by');

// Serve only the public files by name. Serving the project root as a static
// folder would also expose server/.env, and with it the API key.
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
for (const page of PAGES) {
  app.get(`/${page}.html`, (req, res) => res.sendFile(path.join(ROOT, `${page}.html`)));
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Turns the query string into OpenWeatherMap location params, or throws a 400. */
function parseLocation({ lat, lon, city }) {
  if (typeof lat === 'string' && typeof lon === 'string' && lat !== '' && lon !== '') {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { lat: latitude, lon: longitude };
    }
    throw new HttpError(400, '위도는 -90~90, 경도는 -180~180 사이여야 해요.');
  }
  if (typeof city === 'string' && /^[\p{L} .,'-]{1,80}$/u.test(city)) {
    return { q: city };
  }
  throw new HttpError(400, '위도와 경도, 또는 올바른 도시 이름을 입력해 주세요.');
}

async function fetchOwm(endpoint, params) {
  const query = new URLSearchParams({
    ...params,
    units: 'metric',
    lang: 'kr',
    appid: process.env.OPENWEATHER_API_KEY,
  });
  const response = await fetch(`${OWM_BASE_URL}/${endpoint}?${query}`, {
    signal: AbortSignal.timeout(OWM_TIMEOUT_MS),
  });

  if (response.ok) return response.json();
  if (response.status === 401) {
    throw new HttpError(502, 'OpenWeatherMap에서 API 키를 거부했어요. 새로 만든 키는 활성화까지 몇 시간 걸릴 수 있어요.');
  }
  if (response.status === 404) throw new HttpError(404, '해당 도시를 찾을 수 없어요.');
  if (response.status === 429) throw new HttpError(503, '날씨 요청 한도를 넘었어요. 잠시 후 다시 시도해 주세요.');
  throw new HttpError(502, '날씨 서비스에서 오류가 발생했어요.');
}

app.get('/api/weather', async (req, res) => {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      throw new HttpError(500, 'OPENWEATHER_API_KEY가 설정되지 않았어요. server/.env에 키를 넣고 서버를 다시 시작해 주세요.');
    }
    const location = parseLocation(req.query);

    // Current conditions only report rain or snow that has already fallen, so the
    // chance of precipitation comes from the next forecast slot. That number is a
    // nice-to-have: if it fails, the rest of the weather is still returned.
    const [current, forecast] = await Promise.all([
      fetchOwm('weather', location),
      fetchOwm('forecast', { ...location, cnt: 1 }).catch(() => null),
    ]);
    const nextSlot = forecast?.list?.[0];

    res.json({
      location: current.name,
      country: current.sys?.country ?? null,
      temp: current.main.temp,
      feelsLike: current.main.feels_like,
      description: current.weather?.[0]?.description ?? '',
      icon: current.weather?.[0]?.icon ?? null,
      precipitation: {
        lastHourMm: (current.rain?.['1h'] ?? 0) + (current.snow?.['1h'] ?? 0),
        chancePercent: typeof nextSlot?.pop === 'number' ? Math.round(nextSlot.pop * 100) : null,
      },
      wind: {
        speed: current.wind?.speed ?? 0,
        deg: current.wind?.deg ?? null,
      },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Weather request failed:', err.message);
    res.status(502).json({ error: '날씨 서비스에 연결하지 못했어요.' });
  }
});

// Bound to this machine only, so other devices on your network can't spend your API quota.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!process.env.OPENWEATHER_API_KEY) {
    console.warn('Warning: OPENWEATHER_API_KEY is not set, so /api/weather will return an error.');
  }
});
