/* Web Crypto による端末内暗号化（PBKDF2-SHA256 + AES-GCM 256bit） */
(function (global) {
  'use strict';

  const ITERATIONS = 310000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const available = () => !!(global.crypto && global.crypto.subtle);

  function randomSalt() {
    return b64(crypto.getRandomValues(new Uint8Array(16)));
  }

  async function deriveKey(passphrase, saltB64, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: unb64(saltB64), iterations: iterations || ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }

  async function decrypt(key, payload) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ct));
    return JSON.parse(dec.decode(pt));
  }

  global.JCrypto = { available, randomSalt, deriveKey, encrypt, decrypt, ITERATIONS };
})(window);
