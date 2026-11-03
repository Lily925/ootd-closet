// The clothing form, used by add.html for new items and by the edit dialog in
// closet.html for existing ones. Requires db.js and clothes-options.js.
window.ClothesForm = (function () {
  const { CATEGORIES, COLORS, THICKNESSES } = window.ClothesOptions;

  const MAX_PHOTO_SIDE = 800;
  const JPEG_QUALITY = 0.8;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_NAME_LENGTH = 40;
  const MAX_TAGS = 10;
  const MAX_TAG_LENGTH = 20;

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image could not be decoded'));
      image.src = src;
    });
  }

  /** Shrinks a photo so its longer side is at most 800px and re-encodes it as JPEG. */
  async function compressPhoto(file) {
    const image = await loadImage(await readAsDataUrl(file));
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(image.naturalWidth, image.naturalHeight));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    // JPEG has no transparency, and transparent PNG pixels would otherwise turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  }

  /** Turns "#겨울, 데일리, 겨울" into ['겨울', '데일리']. */
  function parseTags(text) {
    const tags = text.split(',').map((tag) => tag.trim().replace(/^#+/, '').trim()).filter(Boolean);
    return [...new Set(tags)];
  }

  function optionsHtml(options) {
    const items = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
    return `<option value="">선택해 주세요</option>${items}`;
  }

  function selectField(name, label, options) {
    return `
      <div class="field">
        <label class="field__label" for="clothes-${name}">${label}</label>
        <select class="select" id="clothes-${name}" name="${name}" aria-describedby="clothes-${name}-error">
          ${optionsHtml(options)}
        </select>
        <p class="field__error" id="clothes-${name}-error"></p>
      </div>`;
  }

  function saveErrorMessage(error) {
    if (error.name === 'QuotaExceededError') return '저장 공간이 부족해요. 안 입는 옷을 지운 뒤 다시 시도해 주세요.';
    if (error.name === 'NotFoundError') return '이미 삭제된 옷이에요.';
    return '저장하지 못했어요. 다시 시도해 주세요.';
  }

  /**
   * Renders the form into `container`. Pass `item` to edit it instead of creating
   * a new one. `onSaved(savedItem, controls)` runs after a successful save, and a
   * cancel button appears only if `onCancel` is given.
   */
  function mount(container, { item = null, onSaved, onCancel = null }) {
    container.innerHTML = `
      <form class="clothes-form" novalidate autocomplete="off">
        <div class="field">
          <label class="field__label" for="clothes-photo">사진</label>
          <input class="input" id="clothes-photo" name="photo" type="file" accept="image/*"
            aria-describedby="clothes-photo-hint clothes-photo-error">
          <p class="field__hint" id="clothes-photo-hint" role="status"></p>
          <p class="field__error" id="clothes-photo-error"></p>
          <img class="photo-preview" alt="선택한 사진 미리보기" hidden>
        </div>
        <div class="field">
          <label class="field__label" for="clothes-name">이름</label>
          <input class="input" id="clothes-name" name="name" type="text"
            placeholder="예: 검정 울 코트" aria-describedby="clothes-name-error">
          <p class="field__error" id="clothes-name-error"></p>
        </div>
        <div class="clothes-form__row">
          ${selectField('category', '종류', CATEGORIES)}
          ${selectField('color', '색상', COLORS)}
          ${selectField('thickness', '두께', THICKNESSES)}
        </div>
        <div class="field">
          <label class="field__label" for="clothes-tags">태그 (선택)</label>
          <input class="input" id="clothes-tags" name="tags" type="text"
            placeholder="쉼표로 구분해 주세요. 예: 겨울, 데일리"
            aria-describedby="clothes-tags-error">
          <p class="field__error" id="clothes-tags-error"></p>
        </div>
        <div class="clothes-form__actions">
          <button class="button" type="submit">${item ? '수정 내용 저장' : '옷장에 저장'}</button>
          ${onCancel ? '<button class="button button--secondary" type="button" data-cancel>취소</button>' : ''}
        </div>
        <p class="form-status" role="status"></p>
      </form>`;

    const form = container.querySelector('form');
    const control = (name) => form.elements[name];
    const submitButton = form.querySelector('[type="submit"]');
    const preview = form.querySelector('.photo-preview');
    const photoHint = form.querySelector('#clothes-photo-hint');
    const status = form.querySelector('.form-status');

    const DEFAULT_PHOTO_HINT = item ? '바꾸고 싶을 때만 새 사진을 선택해 주세요.' : '';

    let photo = null;
    let saving = false;
    let processingPhoto = false;
    // Discards a slow compression if another photo was picked in the meantime.
    let latestPhotoPick = 0;

    const validators = {
      photo: () => (photo ? '' : '사진을 선택해 주세요.'),
      name: () => {
        const name = control('name').value.trim();
        if (!name) return '이름을 입력해 주세요.';
        return name.length > MAX_NAME_LENGTH ? `이름은 ${MAX_NAME_LENGTH}자 이내로 입력해 주세요.` : '';
      },
      category: () => (control('category').value ? '' : '종류를 선택해 주세요.'),
      color: () => (control('color').value ? '' : '색상을 선택해 주세요.'),
      thickness: () => (control('thickness').value ? '' : '두께를 선택해 주세요.'),
      tags: () => {
        const tags = parseTags(control('tags').value);
        if (tags.length > MAX_TAGS) return `태그는 ${MAX_TAGS}개까지 넣을 수 있어요.`;
        return tags.some((tag) => tag.length > MAX_TAG_LENGTH) ? `태그는 ${MAX_TAG_LENGTH}자 이내로 입력해 주세요.` : '';
      },
    };

    function showError(name, message) {
      form.querySelector(`#clothes-${name}-error`).textContent = message;
      if (message) control(name).setAttribute('aria-invalid', 'true');
      else control(name).removeAttribute('aria-invalid');
    }

    function validateAll() {
      let firstInvalid = null;
      for (const [name, validate] of Object.entries(validators)) {
        const message = validate();
        showError(name, message);
        if (message && !firstInvalid) firstInvalid = control(name);
      }
      firstInvalid?.focus();
      return !firstInvalid;
    }

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle('form-status--error', isError);
    }

    function updateSubmitButton() {
      submitButton.disabled = saving || processingPhoto;
    }

    function setPhoto(dataUrl) {
      photo = dataUrl;
      preview.hidden = !dataUrl;
      if (dataUrl) preview.src = dataUrl;
      else preview.removeAttribute('src');
    }

    function fill() {
      form.reset();
      latestPhotoPick++;
      processingPhoto = false;
      photoHint.textContent = DEFAULT_PHOTO_HINT;
      setPhoto(item?.photo ?? null);
      if (item) {
        control('name').value = item.name;
        control('category').value = item.category;
        control('color').value = item.color;
        control('thickness').value = item.thickness;
        control('tags').value = item.tags.join(', ');
      }
      Object.keys(validators).forEach((name) => showError(name, ''));
      updateSubmitButton();
    }

    async function handlePhotoPicked() {
      const file = control('photo').files[0];
      // Closing the file picker can clear the input. Keep whatever photo we have.
      if (!file) return;

      const pick = ++latestPhotoPick;
      const reject = (message) => {
        control('photo').value = '';
        showError('photo', message);
        // This pick may have replaced one still processing, which will now never finish.
        processingPhoto = false;
        photoHint.textContent = DEFAULT_PHOTO_HINT;
        updateSubmitButton();
      };

      if (!file.type.startsWith('image/')) {
        reject('이미지 파일만 올릴 수 있어요.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        reject('사진 용량은 20MB 이하여야 해요.');
        return;
      }

      showError('photo', '');
      processingPhoto = true;
      updateSubmitButton();
      photoHint.textContent = '사진을 처리하는 중…';

      try {
        const compressed = await compressPhoto(file);
        if (pick !== latestPhotoPick) return;
        setPhoto(compressed);
        processingPhoto = false;
        photoHint.textContent = DEFAULT_PHOTO_HINT;
        updateSubmitButton();
      } catch {
        if (pick !== latestPhotoPick) return;
        reject('이 사진은 읽을 수 없어요. JPG나 PNG 파일로 다시 시도해 주세요.');
      }
    }

    control('photo').addEventListener('change', handlePhotoPicked);

    // Once a field has been flagged, update its message as it gets corrected. The
    // photo is skipped because its validator can't see a pick that's still processing.
    form.addEventListener('input', ({ target }) => {
      setStatus('');
      if (target.name !== 'photo' && target.hasAttribute('aria-invalid')) {
        showError(target.name, validators[target.name]());
      }
    });

    form.querySelector('[data-cancel]')?.addEventListener('click', onCancel);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus('');
      if (!validateAll()) return;

      const values = {
        name: control('name').value.trim(),
        category: control('category').value,
        color: control('color').value,
        thickness: control('thickness').value,
        tags: parseTags(control('tags').value),
        photo,
      };

      saving = true;
      updateSubmitButton();
      try {
        const now = Date.now();
        let saved;
        if (item) {
          saved = await window.ClothesDB.update(item.id, { ...values, updatedAt: now });
        } else {
          const record = { ...values, createdAt: now, updatedAt: now };
          saved = { ...record, id: await window.ClothesDB.add(record) };
        }
        onSaved(saved, { reset: fill, status });
      } catch (error) {
        setStatus(saveErrorMessage(error), true);
      } finally {
        saving = false;
        updateSubmitButton();
      }
    });

    fill();
  }

  return { mount };
})();
