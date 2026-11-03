// closet.html: lists saved clothes with filters, search, edit and delete.
// Everything updates in place. User-entered text only ever goes in via textContent.
(function () {
  const { CATEGORIES, COLORS, THICKNESSES, labelOf } = window.ClothesOptions;

  const heading = document.querySelector('h1');
  const filtersForm = document.getElementById('closet-filters');
  const searchInput = filtersForm.elements.search;
  const countText = document.getElementById('closet-count');
  const errorText = document.getElementById('closet-error');
  const grid = document.getElementById('closet-grid');
  const emptyState = document.getElementById('closet-empty');
  const emptyLink = emptyState.querySelector('a');
  const noResults = document.getElementById('closet-no-results');
  const cardTemplate = document.getElementById('clothes-card-template');

  const editDialog = document.getElementById('edit-dialog');
  const editFormRoot = document.getElementById('edit-form');
  const deleteDialog = document.getElementById('delete-dialog');
  const deleteName = document.getElementById('delete-name');

  // Newest first. Cards are kept and reused between renders, so typing in the
  // search box doesn't decode every photo again and make the grid flicker.
  let clothes = [];
  const cards = new Map();
  let pendingDelete = null;

  function fillFilter(select, options) {
    for (const { value, label } of options) select.add(new Option(label, value));
  }

  function normalize(text) {
    return text.normalize('NFC').toLowerCase();
  }

  function matchesFilters(item) {
    const { category, color, thickness } = filtersForm.elements;
    if (category.value && item.category !== category.value) return false;
    if (color.value && item.color !== color.value) return false;
    if (thickness.value && item.thickness !== thickness.value) return false;

    const searchable = normalize([
      item.name,
      ...item.tags,
      labelOf(CATEGORIES, item.category),
      labelOf(COLORS, item.color),
      labelOf(THICKNESSES, item.thickness),
    ].join(' '));
    // Every word has to appear, so "블랙 코트" finds a coat that's tagged black.
    return normalize(searchInput.value).split(/\s+/).every((word) => searchable.includes(word));
  }

  function createCard(item) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const field = (name) => card.querySelector(`[data-field="${name}"]`);

    field('photo').src = item.photo;
    field('photo').alt = item.name;
    field('name').textContent = item.name;
    field('category').textContent = labelOf(CATEGORIES, item.category);
    field('color-label').textContent = labelOf(COLORS, item.color);
    field('thickness').textContent = labelOf(THICKNESSES, item.thickness);

    const hex = COLORS.find((color) => color.value === item.color)?.hex;
    field('color-swatch').hidden = !hex;
    if (hex) field('color-swatch').style.backgroundColor = hex;

    field('tags').hidden = item.tags.length === 0;
    for (const tag of item.tags) {
      const chip = document.createElement('li');
      chip.className = 'tag';
      chip.textContent = `#${tag}`;
      field('tags').append(chip);
    }

    const editButton = field('edit');
    const deleteButton = field('delete');
    editButton.setAttribute('aria-label', `${item.name} 수정`);
    deleteButton.setAttribute('aria-label', `${item.name} 삭제`);
    editButton.addEventListener('click', () => openEditDialog(item));
    deleteButton.addEventListener('click', () => openDeleteDialog(item));
    return card;
  }

  function cardFor(item) {
    if (!cards.has(item.id)) cards.set(item.id, createCard(item));
    return cards.get(item.id);
  }

  function render() {
    const isEmpty = clothes.length === 0;
    const visible = clothes.filter(matchesFilters);

    grid.replaceChildren(...visible.map(cardFor));
    grid.hidden = visible.length === 0;
    emptyState.hidden = !isEmpty;
    filtersForm.hidden = isEmpty;
    noResults.hidden = isEmpty || visible.length > 0;
    countText.textContent = isEmpty ? '' : `전체 ${clothes.length}개 중 ${visible.length}개`;
  }

  async function load() {
    try {
      const all = await window.ClothesDB.getAll();
      clothes = all.reverse();
      cards.clear();
      errorText.textContent = '';
      render();
    } catch {
      errorText.textContent = '옷장을 불러오지 못했어요. 페이지를 새로 고침해 주세요.';
    }
  }

  function openEditDialog(item) {
    window.ClothesForm.mount(editFormRoot, {
      item,
      onSaved(saved) {
        clothes = clothes.map((other) => (other.id === saved.id ? saved : other));
        cards.delete(saved.id);
        editDialog.close();
        render();
        // The old card is gone, and an edit can move the item out of the current filter.
        const button = cards.get(saved.id)?.querySelector('[data-field="edit"]');
        if (button?.isConnected) button.focus();
        else heading.focus();
      },
      onCancel: () => editDialog.close(),
    });
    editDialog.showModal();
  }

  function openDeleteDialog(item) {
    pendingDelete = item;
    deleteName.textContent = item.name;
    deleteDialog.returnValue = ''; // Pressing Esc leaves this untouched.
    deleteDialog.showModal();
  }

  async function deletePending() {
    const item = pendingDelete;
    const position = [...grid.children].indexOf(cards.get(item.id));

    errorText.textContent = '';
    try {
      await window.ClothesDB.delete(item.id);
    } catch {
      errorText.textContent = '삭제하지 못했어요. 다시 시도해 주세요.';
      return;
    }

    clothes = clothes.filter((other) => other.id !== item.id);
    cards.delete(item.id);
    render();

    // The button that had focus just disappeared, so move on to a sensible neighbour.
    const neighbour = grid.children[position] || grid.lastElementChild;
    const nextFocus = neighbour?.querySelector('[data-field="delete"]')
      || (clothes.length === 0 ? emptyLink : searchInput);
    nextFocus.focus();
  }

  fillFilter(filtersForm.elements.category, CATEGORIES);
  fillFilter(filtersForm.elements.color, COLORS);
  fillFilter(filtersForm.elements.thickness, THICKNESSES);

  filtersForm.addEventListener('input', render);
  filtersForm.addEventListener('submit', (event) => event.preventDefault());
  filtersForm.querySelector('[data-reset]').addEventListener('click', () => {
    filtersForm.reset();
    render();
    searchInput.focus();
  });

  editDialog.addEventListener('close', () => editFormRoot.replaceChildren());
  deleteDialog.addEventListener('close', () => {
    if (deleteDialog.returnValue === 'confirm') deletePending();
  });

  // pageshow also fires when returning with the Back button, when the page can
  // come from the browser's cache and miss clothes added on add.html. It runs
  // after the browser restores the filter fields, so those are applied too.
  window.addEventListener('pageshow', load);
})();
