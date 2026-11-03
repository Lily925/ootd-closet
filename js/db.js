// IndexedDB helper for the clothes store. Every method returns a Promise.
//
// A clothing item looks like:
//   { id, name, category, color, thickness, tags: [], photo: 'data:image/jpeg...',
//     createdAt, updatedAt }
window.ClothesDB = (function () {
  const DB_NAME = 'whats-to-wear';
  const DB_VERSION = 1;
  const STORE = 'clothes';

  let opening = null;

  function open() {
    if (opening) return opening;

    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      };

      request.onsuccess = () => {
        const db = request.result;
        // Let go of the connection when it dies, or when a newer version of the
        // site in another tab needs to upgrade. The next call simply reopens it.
        db.onclose = () => { opening = null; };
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };

      request.onerror = () => reject(request.error);
    }).catch((error) => {
      opening = null; // Don't cache the failure, so a later call can try again.
      throw error;
    });

    return opening;
  }

  // Resolves when the transaction commits rather than when the request succeeds,
  // because a full disk can still fail the write at commit time.
  async function withStore(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      // tx.error is null only for an explicit abort, which update() uses for a missing id.
      transaction.onabort = () => {
        reject(transaction.error || new DOMException('Clothing item not found', 'NotFoundError'));
      };
    });
  }

  /** Saves a new item and resolves with its generated id. */
  function add(item) {
    return withStore('readwrite', (store) => store.add(item));
  }

  /** Resolves with the item, or undefined if there is no such id. */
  function get(id) {
    return withStore('readonly', (store) => store.get(id));
  }

  /** Resolves with every item, oldest first. */
  function getAll() {
    return withStore('readonly', (store) => store.getAll());
  }

  /**
   * Merges `changes` into an existing item and resolves with the result. Rejects
   * with a NotFoundError if it's gone, instead of bringing a deleted item back.
   */
  async function update(id, changes) {
    let updated;
    await withStore('readwrite', (store) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          store.transaction.abort();
          return;
        }
        updated = { ...request.result, ...changes, id };
        store.put(updated);
      };
      return request;
    });
    return updated;
  }

  /** Removes an item. Deleting an id that doesn't exist is not an error. */
  async function remove(id) {
    await withStore('readwrite', (store) => store.delete(id));
  }

  return { add, get, getAll, update, delete: remove };
})();
