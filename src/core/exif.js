/**
 * Minimal metadata readers for JPEG (EXIF / XMP / JUMBF) and PNG
 * (tEXt / iTXt / zTXt / eXIf / caBX). No dependencies, no DOM.
 *
 * The goal is *provenance signal*, not a full EXIF library: we want to know
 * which software produced a file, whether a camera was involved, and whether
 * a C2PA / Content Credentials manifest is present.
 */

const AI_GENERATOR_SIGNATURES = [
  'stable diffusion', 'sdxl', 'sd3', 'flux.1', 'flux1', 'black forest labs',
  'midjourney', 'dall-e', 'dall·e', 'dalle', 'openai', 'sora',
  'adobe firefly', 'firefly', 'comfyui', 'automatic1111', 'a1111',
  'novelai', 'invokeai', 'leonardo.ai', 'leonardo ai', 'ideogram',
  'playground ai', 'nightcafe', 'craiyon', 'krea', 'recraft',
  'stability ai', 'stability.ai', 'runway', 'pika', 'luma',
  'bing image creator', 'designer.microsoft', 'imagen', 'gemini',
  'grok', 'xai', 'canva ai', 'picsart', 'fotor', 'deepai',
  'draw things', 'fooocus', 'forge', 'swarmui',
];

const C2PA_SIGNATURES = ['c2pa', 'jumb', 'content credentials', 'contentcredentials'];

const SOFTWARE_TAGS = [
  'photoshop', 'lightroom', 'gimp', 'darktable', 'capture one', 'affinity',
  'snapseed', 'instagram', 'pixelmator', 'paintshop', 'camera raw',
];

/** Read a 32-bit big-endian unsigned integer. */
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u16le = (b, o) => b[o] | (b[o + 1] << 8);
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function ascii(b, o, len) {
  let s = '';
  for (let i = 0; i < len && o + i < b.length; i += 1) {
    const c = b[o + i];
    s += c >= 32 && c < 127 ? String.fromCharCode(c) : ' ';
  }
  return s;
}

function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

/** Detect the container format from magic bytes. */
export function detectFormat(bytes) {
  if (!bytes || bytes.length < 4) return 'unknown';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return 'ico';
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return 'flac';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = ascii(bytes, 8, 4).trim();
    if (/avif/i.test(brand)) return 'avif';
    if (/heic|heix|mif1|msf1/i.test(brand)) return 'heif';
    return 'isobmff';
  }
  if (bytes.length > 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  return 'unknown';
}

/** Parse an EXIF IFD from a TIFF block. Returns a flat tag map. */
function parseTiff(bytes, tiffStart) {
  if (tiffStart + 8 > bytes.length) return null;
  const endian = ascii(bytes, tiffStart, 2);
  const little = endian === 'II';
  const u16 = little ? u16le : u16be;
  const u32 = little ? u32le : u32be;
  if (u16(bytes, tiffStart + 2) !== 0x002a) return null;
  const ifd0 = tiffStart + u32(bytes, tiffStart + 4);
  const tags = {};

  const readIfd = (offset) => {
    if (offset + 2 > bytes.length) return;
    const count = u16(bytes, offset);
    for (let i = 0; i < count; i += 1) {
      const e = offset + 2 + i * 12;
      if (e + 12 > bytes.length) break;
      const tag = u16(bytes, e);
      const type = u16(bytes, e + 2);
      const num = u32(bytes, e + 4);
      const sizeOf = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1;
      const total = num * sizeOf;
      let valOff = e + 8;
      let inline = true;
      if (total > 4) {
        valOff = tiffStart + u32(bytes, e + 8);
        inline = false;
      }
      if (!inline && (valOff < 0 || valOff >= bytes.length)) continue;
      if (type === 2) {
        // ASCII
        let len = num;
        let s = ascii(bytes, valOff, len).replace(/\0+$/, '').trim();
        // trim trailing garbage after NUL
        const nul = s.indexOf('\0');
        if (nul >= 0) s = s.slice(0, nul);
        tags[tag] = s;
      } else if (type === 3) {
        const arr = [];
        for (let k = 0; k < Math.min(num, 16); k += 1) {
          const o = inline ? e + 8 + k * 2 : valOff + k * 2;
          arr.push(u16(bytes, o));
        }
        tags[tag] = arr.length === 1 ? arr[0] : arr;
      } else if (type === 4) {
        const arr = [];
        for (let k = 0; k < Math.min(num, 16); k += 1) {
          const o = inline ? e + 8 + k * 4 : valOff + k * 4;
          arr.push(u32(bytes, o));
        }
        tags[tag] = arr.length === 1 ? arr[0] : arr;
      } else if (type === 7) {
        tags[tag] = decodeText(bytes.subarray(valOff, valOff + Math.min(num, 4096)));
      }
    }
    // Next IFD pointer for basic chaining (ExifIFD / GPS are separate; we keep IFD0).
    return u32(bytes, offset + 2 + count * 12);
  };

  readIfd(ifd0);
  return tags;
}

const EXIF_NAMES = {
  0x010f: 'make',
  0x0110: 'model',
  0x0112: 'orientation',
  0x011a: 'xResolution',
  0x0131: 'software',
  0x0132: 'dateTime',
  0x013b: 'artist',
  0x8298: 'copyright',
  0x829a: 'exposureTime',
  0x829d: 'fNumber',
  0x8827: 'iso',
  0x9003: 'dateTimeOriginal',
  0x920a: 'focalLength',
  0xa430: 'ownerName',
  0xa431: 'serialNumber',
  0xa432: 'lensSpec',
  0xa433: 'lensMake',
  0xa434: 'lensModel',
};

/**
 * Extract provenance metadata from raw image bytes.
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {{format:string, exif:object, software:string, fields:string[], c2pa:boolean, xmp:string, rawTexts:string[]}}
 */
export function readMetadata(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const format = detectFormat(bytes);
  const result = {
    format,
    exif: {},
    software: '',
    camera: '',
    fields: [],
    c2pa: false,
    xmp: '',
    rawTexts: [],
    hasMetadata: false,
  };

  // Fast global scan for textual signatures (JPEG + PNG segments are all here).
  const headLen = Math.min(bytes.length, 512 * 1024);
  const headText = decodeText(bytes.subarray(0, headLen)).toLowerCase();
  for (const sig of C2PA_SIGNATURES) {
    if (headText.includes(sig)) {
      result.c2pa = true;
      break;
    }
  }
  result.generatorSignatures = AI_GENERATOR_SIGNATURES.filter((s) => headText.includes(s));
  result.softwareSignatures = SOFTWARE_TAGS.filter((s) => headText.includes(s));

  if (format === 'jpeg') {
    let i = 2;
    while (i + 4 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xda) break; // start of scan
      const len = u16be(bytes, i + 2);
      const segStart = i + 4;
      const segEnd = i + 2 + len;
      if (segEnd > bytes.length) break;
      if (marker === 0xe1) {
        // APP1: EXIF or XMP
        const tag = ascii(bytes, segStart, 6);
        if (tag.startsWith('Exif')) {
          const tiff = segStart + 6;
          const tags = parseTiff(bytes, tiff);
          if (tags) {
            for (const [k, v] of Object.entries(tags)) {
              const name = EXIF_NAMES[Number(k)];
              if (name) result.exif[name] = v;
            }
          }
        } else if (tag.includes('http')) {
          result.xmp = decodeText(bytes.subarray(segStart, segEnd)).slice(0, 8192);
        }
      } else if (marker === 0xeb) {
        // APP11 JUMBF — C2PA lives here.
        result.c2pa = true;
      } else if (marker === 0xfe) {
        result.rawTexts.push(ascii(bytes, segStart, Math.min(len - 2, 512)));
      }
      i = segEnd;
    }
  } else if (format === 'png') {
    let i = 8;
    while (i + 8 <= bytes.length) {
      const len = u32be(bytes, i);
      const type = ascii(bytes, i + 4, 4);
      const dataStart = i + 8;
      const dataEnd = dataStart + len;
      if (dataEnd > bytes.length) break;
      if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
        result.rawTexts.push(decodeText(bytes.subarray(dataStart, Math.min(dataEnd, dataStart + 4096))));
      } else if (type === 'eXIf') {
        const tags = parseTiff(bytes, dataStart);
        if (tags) {
          for (const [k, v] of Object.entries(tags)) {
            const name = EXIF_NAMES[Number(k)];
            if (name) result.exif[name] = v;
          }
        }
      } else if (type === 'caBX' || type === 'iTXt') {
        result.c2pa = true;
      }
      i = dataEnd + 4;
    }
  }

  const exif = result.exif;
  result.hasMetadata = Object.keys(exif).length > 0;
  result.software = String(exif.software || '').trim();
  const make = String(exif.make || '').trim();
  const model = String(exif.model || '').trim();
  result.camera = [make, model].filter(Boolean).join(' ');
  result.fields = Object.keys(exif);

  return result;
}

export { AI_GENERATOR_SIGNATURES, C2PA_SIGNATURES, SOFTWARE_TAGS };
