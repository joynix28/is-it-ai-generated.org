/**
 * Minimal CBOR (RFC 8949) decoder.
 *
 * C2PA claims and assertions are CBOR. We only need decoding, and only for the
 * subset C2PA uses, so this is a compact reader rather than a full library.
 * Deterministic and dependency-free so it runs in the browser.
 */

const TD = new TextDecoder('utf-8', { fatal: false });

class CborReader {
  constructor(bytes) {
    this.b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.view = new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
    this.pos = 0;
  }

  u8() { return this.b[this.pos++]; }

  readLength(additional) {
    if (additional < 24) return additional;
    if (additional === 24) return this.u8();
    if (additional === 25) { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
    if (additional === 26) { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
    if (additional === 27) {
      const hi = this.view.getUint32(this.pos);
      const lo = this.view.getUint32(this.pos + 4);
      this.pos += 8;
      const v = hi * 2 ** 32 + lo;
      if (!Number.isSafeInteger(v)) throw new Error('CBOR integer out of safe range');
      return v;
    }
    if (additional === 31) return -1; // indefinite length
    throw new Error(`CBOR: bad additional info ${additional}`);
  }

  decodeItem() {
    const initial = this.u8();
    const major = initial >> 5;
    const additional = initial & 0x1f;

    switch (major) {
      case 0: return this.readLength(additional); // unsigned
      case 1: return -1 - this.readLength(additional); // negative
      case 2: return this.readBytes(additional); // byte string
      case 3: return this.readText(additional); // text string
      case 4: return this.readArray(additional);
      case 5: return this.readMap(additional);
      case 6: { const tag = this.readLength(additional); return { __tag: tag, value: this.decodeItem() }; }
      case 7: return this.readSimple(additional);
      default: throw new Error(`CBOR: unknown major type ${major}`);
    }
  }

  readBytes(additional) {
    const len = this.readLength(additional);
    if (len === -1) {
      const chunks = [];
      while (this.b[this.pos] !== 0xff) chunks.push(this.decodeItem());
      this.pos += 1;
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const out = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      return out;
    }
    const out = this.b.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  readText(additional) {
    const len = this.readLength(additional);
    if (len === -1) {
      let s = '';
      while (this.b[this.pos] !== 0xff) s += this.decodeItem();
      this.pos += 1;
      return s;
    }
    const s = TD.decode(this.b.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }

  readArray(additional) {
    const len = this.readLength(additional);
    const out = [];
    if (len === -1) {
      while (this.b[this.pos] !== 0xff) out.push(this.decodeItem());
      this.pos += 1;
      return out;
    }
    for (let i = 0; i < len; i += 1) out.push(this.decodeItem());
    return out;
  }

  readMap(additional) {
    const len = this.readLength(additional);
    const out = new Map();
    const put = (k, v) => out.set(typeof k === 'object' && k && k.__tag != null ? k.value : k, v);
    if (len === -1) {
      while (this.b[this.pos] !== 0xff) { const k = this.decodeItem(); put(k, this.decodeItem()); }
      this.pos += 1;
      return out;
    }
    for (let i = 0; i < len; i += 1) {
      const k = this.decodeItem();
      put(k, this.decodeItem());
    }
    return out;
  }

  readSimple(additional) {
    if (additional === 20) return false;
    if (additional === 21) return true;
    if (additional === 22) return null;
    if (additional === 23) return undefined;
    if (additional === 24) return this.u8();
    if (additional === 25) { const v = this.view.getUint16(this.pos); this.pos += 2; return halfToFloat(v); }
    if (additional === 26) { const v = this.view.getFloat32(this.pos); this.pos += 4; return v; }
    if (additional === 27) { const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }
    return null;
  }
}

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024);
}

/**
 * Decode the first CBOR item in a buffer.
 * @param {Uint8Array} bytes
 * @returns {{value:any, bytesRead:number}}
 */
export function decodeCbor(bytes) {
  const reader = new CborReader(bytes);
  const value = reader.decodeItem();
  return { value, bytesRead: reader.pos };
}

/** Decode a CBOR item and return the value only. */
export function cborValue(bytes) {
  return decodeCbor(bytes).value;
}

/**
 * Convert decoded CBOR Maps into plain objects for easier consumption.
 * Tags are unwrapped to their values.
 */
export function toPlain(value) {
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value) out[String(k)] = toPlain(v);
    return out;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object' && '__tag' in value) return toPlain(value.value);
  if (value instanceof Uint8Array) return value;
  return value;
}
