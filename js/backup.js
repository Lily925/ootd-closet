// closet.html: saves the whole closet to a JSON file and loads it back.
// The closet only lives in this browser's IndexedDB, so this is how clothes
// move to another device or survive clearing the browser's data.
// Requires db.js and clothes-options.js.
(function () {
  const { CATEGORIES, COLORS, THICKNESSES } = window.ClothesOptions;

  const FORMAT = 'ootd-closet-backup';
  const VERSION = 1;
  const MAX_NAME_LENGTH = 40; // Same limits as the clothing form.
  const MAX_TAGS = 10;
  const MAX_TAG_LENGTH = 20;

  const exportButton = document.getElementById('backup-export');
  const importButton = document.getElementById('backup-import');
  const fileInput = document.getElementById('backup-file');
  const status = document.getElementById('backup-status');

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('form-status--error', isError);
  }

  function setBusy(busy) {
    exportButton.disabled = busy;
    importButton.disabled = busy;
  }

  function today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /** Makes the browser download `text` as a file called `filename`. */
  function downloadFile(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    // Give the download a moment to start before freeing the file from memory.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportCloset() {
    setStatus('');
    setBusy(true);
    try {
      const clothes = await window.ClothesDB.getAll();
      if (clothes.length === 0) {
        setStatus('옷장이 비어 있어서 내보낼 옷이 없어요.', true);
        return;
      }
      const backup = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), clothes };
      downloadFile(JSON.stringify(backup), `옷장-백업-${today()}.json`);
      setStatus(`옷 ${clothes.length}개를 파일로 내보냈어요.`);
    } catch {
      setStatus('내보내지 못했어요. 다시 시도해 주세요.', true);
    } finally {
      setBusy(false);
    }
  }

  const isOneOf = (options, value) => options.some((option) => option.value === value);

  /**
   * Checks one item from the file and copies over only the fields we know.
   * Returns null if it isn't a valid clothing item. The file could have been
   * edited by hand or come from somewhere else, so nothing is trusted as-is.
   */
  function cleanItem(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const { id, name, category, color, thickness, tags, photo, createdAt, updatedAt } = raw;
    if (!Number.isSafeInteger(id) || id < 1) return null;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_LENGTH) return null;
    if (!isOneOf(CATEGORIES, category) || !isOneOf(COLORS, color) || !isOneOf(THICKNESSES, thickness)) return null;
    // Only embedded images: a web address here would make the closet page load
    // something from another site every time it opens.
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) return null;
    if (!Array.isArray(tags) || tags.length > MAX_TAGS) return null;
    if (!tags.every((tag) => typeof tag === 'string' && tag.length <= MAX_TAG_LENGTH)) return null;

    const now = Date.now();
    return {
      id,
      name: name.trim(),
      category,
      color,
      thickness,
      tags,
      photo,
      createdAt: Number.isFinite(createdAt) ? createdAt : now,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : now,
    };
  }

  function importSummary({ added, skipped, invalid }) {
    const parts = [added > 0 ? `옷 ${added}개를 불러왔어요.` : '새로 불러온 옷이 없어요.'];
    if (skipped > 0) parts.push(`이미 있는 옷 ${skipped}개는 건너뛰었어요.`);
    if (invalid > 0) parts.push(`형식이 올바르지 않은 항목 ${invalid}개는 제외했어요.`);
    return parts.join(' ');
  }

  async function importFile(file) {
    setStatus('파일을 불러오는 중…');
    setBusy(true);
    try {
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch {
        setStatus('JSON 파일을 읽을 수 없어요. 옷장 내보내기로 만든 파일인지 확인해 주세요.', true);
        return;
      }
      if (backup?.format !== FORMAT || !Array.isArray(backup.clothes)) {
        setStatus('옷장 백업 파일이 아니에요. 옷장 내보내기로 만든 파일을 선택해 주세요.', true);
        return;
      }
      if (backup.version > VERSION) {
        setStatus('더 새로운 버전에서 만든 백업 파일이에요. 페이지를 새로 고친 뒤 다시 시도해 주세요.', true);
        return;
      }

      const items = backup.clothes.map(cleanItem).filter(Boolean);
      const invalid = backup.clothes.length - items.length;
      const { added, skipped } = await window.ClothesDB.importItems(items);

      setStatus(importSummary({ added, skipped, invalid }), added === 0 && invalid > 0);
      // Let closet.js redraw the cards with the new clothes.
      if (added > 0) document.dispatchEvent(new CustomEvent('closet:changed'));
    } catch (error) {
      setStatus(error?.name === 'QuotaExceededError'
        ? '저장 공간이 부족해서 불러오지 못했어요. 아무것도 추가되지 않았어요.'
        : '불러오지 못했어요. 아무것도 추가되지 않았어요. 다시 시도해 주세요.', true);
    } finally {
      setBusy(false);
    }
  }

  exportButton.addEventListener('click', exportCloset);
  // A real button opens the hidden file picker, so it works with the keyboard too.
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // So choosing the same file again still triggers a change.
    if (file) importFile(file);
  });
})();
