/**
 * C2PA / Content Credentials reader.
 *
 * Reads the JUMBF manifest store from JPEG, PNG, WebP and ISOBMFF containers,
 * CBOR-decodes the claim and assertions, and reports whether the content was
 * declared AI-generated (`trainedAlgorithmicMedia` and friends). Signature
 * verification uses WebCrypto where available.
 *
 * All dependency-free so the browser can do this on a dropped file with nothing
 * leaving the device. Full chain-of-trust validation (trust lists, revocation,
 * RFC 3161 timestamps) is out of scope and flagged as such in the result; use
 * @contentauth/c2pa-web if you need it.
 */

import { decodeCbor, toPlain } from './cbor.js';

const ASCII = (bytes, o, n) => {
  let s = '';
  for (let i = 0; i < n && o + i < bytes.length; i += 1) s += String.fromCharCode(bytes[o + i]);
  return s;
};

const AI_SOURCE_TYPES = [
  'trainedalgorithmicmedia',
  'compositewithtrainedalgorithmicmedia',
  'algorithmicmedia',
  'compositesynthetic',
  'trainedalgorithmicdata',
  'synthetic',
];

/* ------------------------------------------------------------------ boxes */

/** Walk JUMBF boxes in [start, end). */
function readBoxes(bytes, start, end) {
  const boxes = [];
  let i = start;
  while (i + 8 <= end) {
    let size = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
    const type = ASCII(bytes, i + 4, 4);
    let header = 8;
    if (size === 1) {
      // 64-bit extended length.
      if (i + 16 > end) break;
      const hi = (bytes[i + 8] << 24 | bytes[i + 9] << 16 | bytes[i + 10] << 8 | bytes[i + 11]) >>> 0;
      const lo = (bytes[i + 12] << 24 | bytes[i + 13] << 16 | bytes[i + 14] << 8 | bytes[i + 15]) >>> 0;
      size = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      size = end - i;
    }
    if (size < header || i + size > end) break;
    boxes.push({ type, start: i, headerSize: header, dataStart: i + header, dataEnd: i + size, size });
    i += size;
  }
  return boxes;
}

/** Parse a jumd description box. */
function parseJumd(bytes, box) {
  let o = box.dataStart;
  const uuidBytes = bytes.subarray(o, o + 16);
  o += 16;
  const toggles = bytes[o];
  o += 1;
  const out = {
    uuid: [...uuidBytes].map((b) => b.toString(16).padStart(2, '0')).join(''),
    tag: ASCII(uuidBytes, 0, 4),
    toggles,
    label: null,
    id: null,
  };
  if (toggles & 0x02) {
    let s = '';
    while (o < box.dataEnd && bytes[o] !== 0) s += String.fromCharCode(bytes[o++]);
    o += 1;
    out.label = s;
  }
  if (toggles & 0x04) {
    out.id = (bytes[o] << 24 | bytes[o + 1] << 16 | bytes[o + 2] << 8 | bytes[o + 3]) >>> 0;
  }
  return out;
}

/** Build a JUMBF tree rooted at `bytes[start..end)`. */
function buildTree(bytes, start, end) {
  const node = { children: [], desc: null, content: null, contentType: null };
  const boxes = readBoxes(bytes, start, end);
  for (const box of boxes) {
    if (box.type === 'jumd') {
      node.desc = parseJumd(bytes, box);
    } else if (box.type === 'jumb') {
      node.children.push(buildTree(bytes, box.dataStart, box.dataEnd));
    } else if (['cbor', 'json', 'uuid', 'bidb', 'bfdb'].includes(box.type)) {
      node.contentType = box.type;
      node.content = bytes.subarray(box.dataStart, box.dataEnd);
    }
  }
  return node;
}

/* -------------------------------------------------------------- containers */

/** Find the C2PA JUMBF store inside an image. */
export function findJumbfStore(bytes, format) {
  if (format === 'png') {
    let i = 8;
    while (i + 8 <= bytes.length) {
      const len = (bytes[i] << 24 | bytes[i + 1] << 16 | bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
      const type = ASCII(bytes, i + 4, 4);
      if (type === 'caBX') return { store: bytes.subarray(i + 8, i + 8 + len), container: 'png' };
      i += 12 + len;
    }
  } else if (format === 'jpeg') {
    let i = 2;
    const segments = [];
    while (i + 4 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xda) break;
      const len = (bytes[i + 2] << 8 | bytes[i + 3]) >>> 0;
      const seg = i + 4;
      if (marker === 0xeb && ASCII(bytes, seg, 2) === 'JP') {
        const z = (bytes[seg + 4] << 24 | bytes[seg + 5] << 16 | bytes[seg + 6] << 8 | bytes[seg + 7]) >>> 0;
        segments.push({ z, start: seg + 8, end: seg + len - 2 });
      }
      i += 2 + len;
    }
    if (segments.length) {
      segments.sort((a, b) => a.z - b.z);
      const total = segments.reduce((a, s) => a + (s.end - s.start), 0);
      const store = new Uint8Array(total);
      let o = 0;
      for (const s of segments) { store.set(bytes.subarray(s.start, s.end), o); o += s.end - s.start; }
      if (ASCII(store, 4, 4) === 'jumb') return { store, container: 'jpeg' };
    }
  } else if (format === 'webp') {
    let i = 12;
    while (i + 8 <= bytes.length) {
      const id = ASCII(bytes, i, 4);
      const size = (bytes[i + 4] | bytes[i + 5] << 8 | bytes[i + 6] << 16 | bytes[i + 7] << 24) >>> 0;
      if (id === 'C2PA') return { store: bytes.subarray(i + 8, i + 8 + size), container: 'webp' };
      i += 8 + size + (size & 1);
    }
  }

  // Fallback: scan for a JUMBF superbox whose label is "c2pa". Covers ISOBMFF
  // (HEIC/AVIF/MP4) and any container we do not special-case.
  for (let i = 0; i + 16 < bytes.length; i += 1) {
    if (bytes[i] === 0x6a && bytes[i + 1] === 0x75 && bytes[i + 2] === 0x6d && bytes[i + 3] === 0x62) {
      const size = (bytes[i - 4] << 24 | bytes[i - 3] << 16 | bytes[i - 2] << 8 | bytes[i - 1]) >>> 0;
      const labelAt = i + 8 + 16 + 1;
      if (ASCII(bytes, labelAt, 1) === 'c' && size > 16 && i - 4 + size <= bytes.length) {
        return { store: bytes.subarray(i - 4, i - 4 + size), container: format || 'unknown' };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------- claim */

function labelTree(node) {
  const map = new Map();
  for (const child of node.children) {
    const label = child.desc?.label;
    if (label) map.set(label, child);
  }
  return map;
}

/** Extract assertions as {label, value}. */
function readAssertions(node) {
  const out = [];
  const visit = (n) => {
    const label = n.desc?.label || '';
    if (n.content && (n.contentType === 'cbor' || n.contentType === 'json')) {
      let value = null;
      try {
        value = n.contentType === 'cbor'
          ? toPlain(decodeCbor(n.content).value)
          : JSON.parse(new TextDecoder().decode(n.content));
      } catch { value = null; }
      out.push({ label, value, box: n });
    } else if (label.startsWith('c2pa.assertions') || label.startsWith('c2pa.claim') || label.startsWith('c2pa.signature')) {
      out.push({ label, value: null, box: n });
    }
    for (const c of n.children) visit(c);
  };
  for (const c of node.children) visit(c);
  return out;
}

/* -------------------------------------------------------------------- COSE */

/** Minimal CBOR encoder for the COSE Sig_structure. */
function enc(item) {
  const out = [];
  const push = (...b) => out.push(...b);
  if (typeof item === 'string') {
    const s = new TextEncoder().encode(item);
    if (s.length < 24) push(0x60 | s.length); else if (s.length < 256) push(0x78, s.length); else push(0x79, s.length >> 8, s.length & 0xff);
    push(...s);
  } else if (item instanceof Uint8Array) {
    const l = item.length;
    if (l < 24) push(0x40 | l); else if (l < 256) push(0x58, l); else push(0x59, l >> 8, l & 0xff);
    push(...item);
  } else if (Array.isArray(item)) {
    push(0x80 | item.length);
    for (const it of item) out.push(...enc(it));
  }
  return out;
}

/** DER TLV walker. */
function derChildren(bytes, start, end) {
  const kids = [];
  let i = start;
  while (i < end) {
    const tag = bytes[i];
    let len = bytes[i + 1];
    let o = i + 2;
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k += 1) len = len * 256 + bytes[o++];
    }
    kids.push({ tag, start: o, end: o + len, headerStart: i });
    i = o + len;
  }
  return kids;
}

/** Extract SubjectPublicKeyInfo from a DER X.509 certificate. */
function extractSpki(cert) {
  const top = derChildren(cert, 0, cert.length);
  if (!top.length) return null;
  const tbs = derChildren(cert, top[0].start, top[0].end);
  // version [0] optional, then serialNumber(2) signature(3) issuer(4) validity(5) subject(6) spki(7)
  for (const k of tbs) {
    if (k.tag === 0x30) {
      // Could be validity or subject or spki; SPKI starts with SEQUENCE{alg SEQUENCE, BIT STRING}
      const inner = derChildren(cert, k.start, k.end);
      if (inner.length === 2 && inner[1].tag === 0x03) {
        return cert.subarray(k.headerStart, k.end);
      }
    }
  }
  return null;
}

/** Extract the common name from an X.509 subject DER (best effort). */
function extractCN(cert) {
  const top = derChildren(cert, 0, cert.length);
  if (!top.length) return null;
  const tbs = derChildren(cert, top[0].start, top[0].end);
  const subjects = tbs.filter((k) => k.tag === 0x30);
  // subject is the second-to-last SEQUENCE before extensions; scan all for CN OIDs.
  const OID_CN = [0x55, 0x04, 0x03];
  for (const seq of subjects) {
    const sets = derChildren(cert, seq.start, seq.end);
    for (const set of sets) {
      const octets = derChildren(cert, set.start, set.end);
      for (const oidSeq of octets) {
        const parts = derChildren(cert, oidSeq.start, oidSeq.end);
        if (parts.length >= 2) {
          const oidBytes = cert.subarray(parts[0].start, parts[0].end);
          if (oidBytes.length === 3 && oidBytes[0] === OID_CN[0] && oidBytes[1] === OID_CN[1] && oidBytes[2] === OID_CN[2]) {
            return new TextDecoder().decode(cert.subarray(parts[1].start, parts[1].end));
          }
        }
      }
    }
  }
  return null;
}

const COSE_ALGS = {
  '-7': { name: 'ECDSA', hash: 'SHA-256', curve: 'P-256' },
  '-35': { name: 'ECDSA', hash: 'SHA-384', curve: 'P-384' },
  '-36': { name: 'ECDSA', hash: 'SHA-512', curve: 'P-521' },
  '-37': { name: 'RSA-PSS', hash: 'SHA-256', saltLength: 32 },
  '-38': { name: 'RSA-PSS', hash: 'SHA-384', saltLength: 48 },
  '-39': { name: 'RSA-PSS', hash: 'SHA-512', saltLength: 64 },
  '-8': { name: 'Ed25519' },
};

/** Parse the COSE_Sign1 signature box. */
function parseCose(sigBytes) {
  const plain = toPlain(decodeCbor(sigBytes).value);
  // Tagged COSE_Sign1 becomes { __tag: 18, value: [...] } -> toPlain unwraps to array.
  const arr = Array.isArray(plain) ? plain : plain.value;
  if (!Array.isArray(arr) || arr.length < 4) return null;
  const [protectedBytes, unprotected, , signature] = arr;
  let header = {};
  try {
    header = toPlain(decodeCbor(protectedBytes).value);
  } catch { header = {}; }
  return { protectedBytes, unprotected: toPlain(unprotected) || {}, signature, header };
}

/* ------------------------------------------------------------------ public */

/**
 * Parse the C2PA store and report provenance.
 * @param {Uint8Array} bytes
 * @param {string} format
 */
export function analyzeC2pa(bytes, format) {
  if (!bytes || bytes.length < 32) return { present: false };
  let found;
  try {
    found = findJumbfStore(bytes, format);
  } catch (err) {
    return { present: false, error: err.message };
  }
  if (!found) return { present: false };

  let root;
  try {
    // The found store is the JUMBF superbox itself; parse its contents so the
    // `jumd` description attaches to the root node.
    const inner = ASCII(found.store, 4, 4) === 'jumb' ? 8 : 0;
    root = buildTree(found.store, inner, found.store.length);
  } catch (err) {
    return { present: true, container: found.container, error: `JUMBF parse failed: ${err.message}` };
  }
  if (!root.desc && root.children.length === 1 && root.children[0].desc) root = root.children[0];
  if (root.desc?.tag !== 'c2pa') return { present: true, container: found.container, error: 'not a C2PA store' };

  const manifests = root.children.filter((c) => (c.desc?.tag || '') === 'c2ma' || (c.desc?.tag || '') === 'c2um' || (c.desc?.tag || '') === 'c2cm');
  const active = manifests[manifests.length - 1] || root.children[0];
  if (!active) return { present: true, container: found.container, error: 'no manifest' };

  const assertions = readAssertions(active);
  const claimBox = assertions.find((a) => (a.label || '').startsWith('c2pa.claim'));
  const signatureBox = assertions.find((a) => (a.label || '').startsWith('c2pa.signature'));
  const claim = claimBox?.value || null;

  // Actions -> AI determination.
  const actionAssertions = assertions.filter((a) => (a.label || '').startsWith('c2pa.actions'));
  const actions = [];
  const digitalSourceTypes = new Set();
  for (const a of actionAssertions) {
    const list = a.value?.actions;
    if (!Array.isArray(list)) continue;
    for (const act of list) {
      actions.push({
        action: act.action,
        when: act.when || null,
        softwareAgent: typeof act.softwareAgent === 'string' ? act.softwareAgent : act.softwareAgent?.name || null,
        digitalSourceType: act.digitalSourceType || null,
        parameters: act.parameters ? Object.keys(act.parameters) : [],
      });
      if (act.digitalSourceType) digitalSourceTypes.add(act.digitalSourceType);
    }
  }
  const aiSourceTypes = [...digitalSourceTypes].filter((t) => AI_SOURCE_TYPES.some((k) => String(t).toLowerCase().includes(k)));
  const aiGenerated = aiSourceTypes.length > 0
    || actionAssertions.some((a) => JSON.stringify(a.value || {}).toLowerCase().includes('trainedalgorithmic'));

  const generatorInfo = claim?.claim_generator_info || null;
  const claimGenerator = Array.isArray(generatorInfo)
    ? generatorInfo.map((g) => [g.name, g.version].filter(Boolean).join(' ')).join(', ')
    : claim?.claim_generator || null;

  let signer = null;
  let algorithm = null;
  let chainLength = 0;
  let cose = null;
  if (signatureBox?.box?.content) {
    try {
      cose = parseCose(signatureBox.box.content);
      if (cose) {
        algorithm = cose.header['1'] != null ? String(cose.header['1']) : null;
        const x5chain = cose.header['33'];
        const chain = Array.isArray(x5chain) ? x5chain : x5chain ? [x5chain] : [];
        chainLength = chain.length;
        if (chain.length) signer = extractCN(chain[0]);
      }
    } catch { /* leave nulls */ }
  }

  const hardBinding = assertions.find((a) => (a.label || '').startsWith('c2pa.hash'))?.value || null;

  return {
    present: true,
    container: found.container,
    manifestCount: manifests.length,
    claimGenerator,
    generatorInfo,
    title: claim?.['dc:title'] || null,
    format: claim?.['dc:format'] || null,
    actions,
    digitalSourceTypes: [...digitalSourceTypes],
    aiSourceTypes,
    aiGenerated,
    signer,
    algorithm,
    chainLength,
    signaturePresent: Boolean(cose),
    hardBinding: hardBinding ? { algorithm: hardBinding.alg, hasExclusions: Array.isArray(hardBinding.exclusions) } : null,
    assertions: assertions.map((a) => a.label).filter(Boolean),
    issuer: generatorInfo?.[0]?.name || claimGenerator,
    _cose: cose,          // internal, stripped before returning to callers that serialize
    _claimBytes: claimBox?.box?.content || null,
  };
}

/**
 * Verify the COSE_Sign1 signature against the embedded claim.
 * Async because WebCrypto is async. Returns {verified:boolean, reason:string}.
 */
export async function verifyC2pa(bytes, format) {
  const parsed = analyzeC2pa(bytes, format);
  if (!parsed.present) return { verified: false, reason: 'no-manifest' };
  const cose = parsed._cose;
  const claimBytes = parsed._claimBytes;
  if (!cose || !claimBytes) return { verified: false, reason: 'no-signature-or-claim' };
  if (typeof crypto === 'undefined' || !crypto.subtle) return { verified: false, reason: 'no-webcrypto' };

  const alg = COSE_ALGS[String(cose.header['1'])];
  if (!alg) return { verified: false, reason: `unsupported-alg-${cose.header['1']}` };

  const x5chain = cose.header['33'];
  const chain = Array.isArray(x5chain) ? x5chain : x5chain ? [x5chain] : [];
  if (!chain.length) return { verified: false, reason: 'no-x5chain' };

  try {
    const spki = extractSpki(chain[0]);
    if (!spki) return { verified: false, reason: 'bad-certificate' };

    const keyParams = alg.name === 'ECDSA'
      ? { name: 'ECDSA', namedCurve: alg.curve }
      : alg.name === 'RSA-PSS'
        ? { name: 'RSA-PSS', hash: alg.hash }
        : { name: 'Ed25519' };
    const key = await crypto.subtle.importKey('spki', spki, keyParams, false, ['verify']);

    // Sig_structure = ["Signature1", protected, b"", payload]
    const sigStructure = new Uint8Array(enc(['Signature1', cose.protectedBytes, new Uint8Array(0), claimBytes]));
    let signature = cose.signature;
    if (alg.name === 'ECDSA' && signature.length % 2 === 0) {
      // COSE uses raw r||s; WebCrypto wants the same for ECDSA. Nothing to do.
    }
    const verifyParams = alg.name === 'ECDSA'
      ? { name: 'ECDSA', hash: alg.hash }
      : alg.name === 'RSA-PSS'
        ? { name: 'RSA-PSS', saltLength: alg.saltLength }
        : { name: 'Ed25519' };
    const verified = await crypto.subtle.verify(verifyParams, key, signature, sigStructure);
    return { verified, reason: verified ? 'ok' : 'signature-mismatch', signer: parsed.signer, algorithm: alg.name };
  } catch (err) {
    return { verified: false, reason: `verify-error:${err.message}`, signer: parsed.signer };
  }
}

/** Public summary without the internal binary fields. */
export function c2paSummary(parsed) {
  const { _cose, _claimBytes, ...rest } = parsed || {};
  return rest;
}
