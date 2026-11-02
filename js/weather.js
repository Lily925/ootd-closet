// Renders the weather card into any page with a <section data-weather> element.
// Uses the browser's location when allowed, and otherwise falls back to a city.
(function () {
  const root = document.querySelector('[data-weather]');
  if (!root) return;

  const CITIES = [
    { value: 'Seoul,KR', label: '서울' },
    { value: 'Busan,KR', label: '부산' },
    { value: 'Incheon,KR', label: '인천' },
    { value: 'Daegu,KR', label: '대구' },
    { value: 'Daejeon,KR', label: '대전' },
    { value: 'Gwangju,KR', label: '광주' },
    { value: 'Ulsan,KR', label: '울산' },
    { value: 'Jeju,KR', label: '제주' },
  ];
  const DEFAULT_CITY = 'Seoul,KR';
  const MY_LOCATION = 'my-location';
  const STORAGE_KEY = 'weather-city';
  const GEO_TIMEOUT_MS = 8000;
  const COMPASS = ['북풍', '북동풍', '동풍', '남동풍', '남풍', '남서풍', '서풍', '북서풍'];
  const REGION_NAMES = new Intl.DisplayNames(['ko'], { type: 'region' });

  const hasGeolocation = 'geolocation' in navigator;
  const cityOptions = CITIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');

  root.innerHTML = `
    <div class="weather__controls">
      <label for="weather-city">지역</label>
      <select id="weather-city" class="select">
        ${hasGeolocation ? `<option value="${MY_LOCATION}">내 위치</option>` : ''}
        ${cityOptions}
      </select>
    </div>
    <p class="weather__status" role="status" data-field="status"></p>
    <div class="weather__data" data-field="data" hidden>
      <div class="weather__summary">
        <img class="weather__icon" data-field="icon" alt="" width="72" height="72" hidden>
        <div>
          <p class="weather__temp" data-field="temp"></p>
          <p class="weather__description" data-field="description"></p>
          <p class="weather__place" data-field="place"></p>
        </div>
      </div>
      <dl class="weather__details">
        <div><dt>체감 온도</dt><dd data-field="feelsLike"></dd></div>
        <div><dt>강수량</dt><dd data-field="precipitation"></dd></div>
        <div><dt>바람</dt><dd data-field="wind"></dd></div>
      </dl>
    </div>
    <button class="button button--secondary" type="button" data-field="retry" hidden>다시 시도</button>`;

  const field = (name) => root.querySelector(`[data-field="${name}"]`);
  const select = root.querySelector('select');
  const status = field('status');
  const dataPanel = field('data');
  const retryButton = field('retry');

  // These counters discard results that arrive after the user has moved on,
  // for example a slow location fix that lands after they picked a city.
  let latestRequest = 0;
  let latestGeoAttempt = 0;
  let retry = null;

  function readSavedCity() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return CITIES.some((c) => c.value === saved) ? saved : null;
    } catch {
      return null;
    }
  }

  function saveCity(city) {
    try {
      if (city) localStorage.setItem(STORAGE_KEY, city);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked. The city just won't be remembered next visit.
    }
  }

  function formatPrecipitation({ lastHourMm, chancePercent }) {
    const amount = `${Math.round(lastHourMm * 10) / 10} mm`;
    return chancePercent === null ? amount : `${amount} · 강수 확률 ${chancePercent}%`;
  }

  function formatWind({ speed, deg }) {
    const rounded = `${Math.round(speed * 10) / 10} m/s`;
    if (deg === null) return rounded;
    return `${rounded} ${COMPASS[Math.round(deg / 45) % 8]}`;
  }

  // OpenWeatherMap doesn't reliably translate place names, so a city picked from
  // the dropdown shows our own Korean label instead of the name it returns.
  function render(weather, cityLabel) {
    field('temp').textContent = `${Math.round(weather.temp)}°C`;
    field('description').textContent = weather.description;
    const country = weather.country ? REGION_NAMES.of(weather.country) : null;
    field('place').textContent = [cityLabel || weather.location, country].filter(Boolean).join(', ');
    field('feelsLike').textContent = `${Math.round(weather.feelsLike)}°C`;
    field('precipitation').textContent = formatPrecipitation(weather.precipitation);
    field('wind').textContent = formatWind(weather.wind);

    const icon = field('icon');
    icon.hidden = !weather.icon;
    if (weather.icon) icon.src = `https://openweathermap.org/img/wn/${weather.icon}@2x.png`;
    dataPanel.hidden = false;
  }

  async function loadWeather(params, note = '') {
    const request = ++latestRequest;
    retry = () => loadWeather(params, note);
    retryButton.hidden = true;
    status.classList.remove('weather__status--error');
    status.textContent = '날씨를 불러오는 중…';
    root.setAttribute('aria-busy', 'true');

    let message = null;
    try {
      const response = await fetch(`/api/weather?${new URLSearchParams(params)}`);
      const body = await response.json();
      if (request !== latestRequest) return;
      if (response.ok) render(body, CITIES.find((c) => c.value === params.city)?.label);
      else message = body.error || '날씨를 불러오지 못했어요.';
    } catch {
      if (request !== latestRequest) return;
      message = '서버에 연결하지 못했어요. 서버가 실행 중인지 확인하고 http://localhost:3000 으로 접속해 주세요.';
    }

    root.removeAttribute('aria-busy');
    if (message) {
      // Hide the old reading so it can't be mistaken for the place just requested.
      dataPanel.hidden = true;
      status.classList.add('weather__status--error');
      retryButton.hidden = false;
    }
    status.textContent = message || note;
  }

  function useMyLocation() {
    const attempt = ++latestGeoAttempt;
    let fellBack = false;
    let timer;

    const fallBack = (reason) => {
      if (attempt !== latestGeoAttempt || fellBack) return;
      fellBack = true;
      clearTimeout(timer);
      select.value = DEFAULT_CITY;
      loadWeather({ city: DEFAULT_CITY }, `${reason} 서울 날씨를 보여 드려요. 위에서 다른 지역을 고를 수 있어요.`);
    };

    if (!hasGeolocation) {
      fallBack('이 브라우저에서는 위치 기능을 쓸 수 없어요.');
      return;
    }

    select.value = MY_LOCATION;
    status.classList.remove('weather__status--error');
    status.textContent = '위치를 확인하는 중…';

    // Browsers don't count time spent on the permission prompt towards their own
    // timeout, so this keeps the card from waiting on a prompt nobody answers.
    // If the prompt is accepted later, the success callback still takes over.
    timer = setTimeout(() => fallBack('위치 확인이 오래 걸리고 있어요.'), GEO_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (attempt !== latestGeoAttempt) return;
        clearTimeout(timer);
        select.value = MY_LOCATION;
        loadWeather({ lat: coords.latitude, lon: coords.longitude });
      },
      (error) => {
        fallBack(error.code === error.PERMISSION_DENIED ? '위치 권한이 꺼져 있어요.' : '위치를 확인하지 못했어요.');
      },
      { timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
    );
  }

  select.addEventListener('change', () => {
    latestGeoAttempt++; // Cancels any location lookup still in progress.
    if (select.value === MY_LOCATION) {
      saveCity(null);
      useMyLocation();
    } else {
      saveCity(select.value);
      loadWeather({ city: select.value });
    }
  });

  retryButton.addEventListener('click', () => retry && retry());

  // The icon is decorative and hosted by OpenWeatherMap, so if it fails, drop it.
  field('icon').addEventListener('error', () => {
    field('icon').hidden = true;
  });

  const savedCity = readSavedCity();
  if (savedCity) {
    select.value = savedCity;
    loadWeather({ city: savedCity });
  } else {
    useMyLocation();
  }
})();
