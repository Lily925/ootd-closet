// main.html: recommends an outfit from the closet for the weather that
// weather.js reports. User-entered text only ever goes in via textContent.
(function () {
  const { COLORS, THICKNESSES, labelOf } = window.ClothesOptions;
  const { plan, combination, missingAdvice } = window.OutfitRules;

  const section = document.getElementById('outfit');
  const statusText = document.getElementById('outfit-status');
  const summary = document.getElementById('outfit-summary');
  const reasonText = document.getElementById('outfit-reason');
  const notesList = document.getElementById('outfit-notes');
  const grid = document.getElementById('outfit-grid');
  const actions = document.getElementById('outfit-actions');
  const nextButton = document.getElementById('outfit-next');
  const countText = document.getElementById('outfit-count');
  const missingBox = document.getElementById('outfit-missing');
  const missingTitle = document.getElementById('outfit-missing-title');
  const missingAdviceText = document.getElementById('outfit-missing-advice');
  const emptyBox = document.getElementById('outfit-empty');
  const emptyAdvice = document.getElementById('outfit-empty-advice');
  const cardTemplate = document.getElementById('outfit-card-template');

  const PLACEHOLDER = { missing: '+', 'not-needed': '–' };

  let weather = null;
  let weatherError = null;
  let clothes = null;
  let closetError = false;

  let planned = null;
  let currentIndex = 0;
  // Combinations already shown, so "다른 코디 보기" doesn't repeat one until
  // every combination has had a turn.
  let seen = new Set();

  function showOnly(...visible) {
    for (const element of [summary, grid, actions, missingBox, emptyBox]) {
      element.hidden = !visible.includes(element);
    }
  }

  function setStatus(message) {
    statusText.textContent = message;
  }

  function createCard(card) {
    const element = cardTemplate.content.firstElementChild.cloneNode(true);
    const field = (name) => element.querySelector(`[data-field="${name}"]`);
    const { item } = card;

    element.classList.add(`outfit-card--${card.state}`);
    field('slot').textContent = card.label;
    field('reason').textContent = card.reason;

    if (item) {
      field('photo').src = item.photo;
      field('photo').alt = item.name;
      field('placeholder').hidden = true;
      field('name').textContent = item.name;
      const meta = document.createElement('span');
      meta.className = 'outfit-card__meta';
      meta.textContent = `${labelOf(COLORS, item.color)} · ${labelOf(THICKNESSES, item.thickness)}`;
      field('name').after(meta);
    } else {
      field('photo').remove();
      field('placeholder').textContent = PLACEHOLDER[card.state];
      field('name').textContent = card.state === 'missing' ? `${card.label} 없음` : '필요 없어요';
    }
    return element;
  }

  function pickNewIndex() {
    const { total } = planned;
    // Once every combination has been shown, start a new round, but never show
    // the one that's on screen right now twice in a row.
    if (seen.size >= total) seen = new Set();
    const available = (index) => !seen.has(index) && (index !== currentIndex || total === 1);

    // Random tries find an unseen one quickly unless nearly all have been seen.
    for (let attempt = 0; attempt < 30; attempt++) {
      const index = Math.floor(Math.random() * total);
      if (available(index)) return index;
    }
    const start = Math.floor(Math.random() * total);
    for (let step = 0; step < total; step++) {
      const index = (start + step) % total;
      if (available(index)) return index;
    }
    return currentIndex;
  }

  function showCombination(index) {
    currentIndex = index;
    seen.add(index);
    grid.replaceChildren(...combination(planned, index).map(createCard));

    const canChange = planned.total > 1;
    nextButton.disabled = !canChange;
    countText.textContent = canChange
      ? `가능한 조합 ${planned.total}가지 중 ${seen.size}번째 코디예요.`
      : '지금 옷장으로는 이 조합 하나만 가능해요. 옷을 더 추가해 보세요.';
  }

  function render() {
    section.removeAttribute('aria-busy');

    if (weatherError) {
      setStatus('날씨를 불러오지 못해서 코디를 추천할 수 없어요. 위에서 다시 시도해 주세요.');
      showOnly();
      return;
    }
    if (closetError) {
      setStatus('옷장을 불러오지 못했어요. 페이지를 새로 고침해 주세요.');
      showOnly();
      return;
    }
    if (!weather || !clothes) return; // Still waiting; the status already says so.

    planned = plan(weather, clothes);
    seen = new Set();
    currentIndex = -1;
    setStatus('');

    if (clothes.length === 0) {
      emptyAdvice.textContent = `${planned.summary} 옷을 추가하면 내 옷장에서 코디를 골라 드릴게요.`;
      showOnly(emptyBox);
      return;
    }

    reasonText.textContent = planned.summary;
    notesList.replaceChildren(...planned.notes.map((note) => {
      const li = document.createElement('li');
      li.textContent = note;
      return li;
    }));
    notesList.hidden = planned.notes.length === 0;

    const visible = [summary, grid, actions];
    if (planned.missing.length > 0) {
      const { title, advice } = missingAdvice(planned);
      missingTitle.textContent = title;
      missingAdviceText.textContent = advice;
      visible.push(missingBox);
    }
    showOnly(...visible);
    showCombination(pickNewIndex());
  }

  async function loadCloset() {
    try {
      clothes = await window.ClothesDB.getAll();
      closetError = false;
    } catch {
      closetError = true;
    }
    render();
  }

  nextButton.addEventListener('click', () => showCombination(pickNewIndex()));

  document.addEventListener('weather:loading', () => {
    section.setAttribute('aria-busy', 'true');
    if (!weather) setStatus('날씨를 확인하는 중이에요…');
  });
  document.addEventListener('weather:change', (event) => {
    weather = event.detail;
    weatherError = null;
    render();
  });
  document.addEventListener('weather:error', (event) => {
    weather = null;
    weatherError = event.detail.message;
    render();
  });

  // pageshow also fires when coming back with the Back button, for example
  // after adding clothes, so the recommendation picks up the new items.
  window.addEventListener('pageshow', loadCloset);
})();
