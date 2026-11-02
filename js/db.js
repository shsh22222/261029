/* IndexedDB の薄いラッパー */
(function (global) {
  'use strict';

  const NAME = 'tsuzuri-journal';
  const VERSION = 1;
  let db = null;

  function req(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    });
  }

  function open() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('entries')) d.createObjectStore('entries', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      r.onsuccess = () => {
        db = r.result;
        resolve(db);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('データベースが他のタブでブロックされています'));
    });
  }

  const store = (name, mode) => db.transaction(name, mode).objectStore(name);

  const DB = {
    open,
    getAll: () => req(store('entries', 'readonly').getAll()),
    put: async (rec) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').put(rec);
      return done(tx);
    },
    remove: async (id) => {
      const tx = db.transaction('entries', 'readwrite');
      tx.objectStore('entries').delete(id);
      return done(tx);
    },
    getMeta: (k) => req(store('meta', 'readonly').get(k)),
    setMeta: async (k, v) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(v, k);
      return done(tx);
    },
    /** エントリーとメタを1トランザクションで原子的に書き換える */
    bulk: async ({ put = [], clear = false, meta = {} }) => {
      const tx = db.transaction(['entries', 'meta'], 'readwrite');
      const es = tx.objectStore('entries');
      const ms = tx.objectStore('meta');
      if (clear) es.clear();
      for (const r of put) es.put(r);
      for (const [k, v] of Object.entries(meta)) {
        if (v === null) ms.delete(k);
        else ms.put(v, k);
      }
      return done(tx);
    },
  };

  global.DB = DB;
})(window);
