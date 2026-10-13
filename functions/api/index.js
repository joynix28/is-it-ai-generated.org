/** GET /api — a small index of the available endpoints. */
import { VERSION } from '../../src/core/index.js';
import { json, preflight } from '../_lib/http.js';

export const onRequestOptions = () => preflight();

export async function onRequestGet() {
  return json({
    name: 'is-it-ai-generated API',
    version: VERSION,
    endpoints: {
      'POST /api/detect': 'AI text detection: { text, language?, sensitivity?, sentences? }',
      'POST /api/count': 'Text statistics: { text, language? }',
      'POST /api/image': 'Image provenance metadata: { base64, mime? } or { data, width, height }',
      'POST /api/provenance': 'C2PA + SynthID + OpenAI content provenance: { base64, mime? }',
      'GET /api/health': 'Liveness check',
      'GET /api/stats': 'Anonymous aggregate site statistics',
      'POST /api/collect': 'Internal anonymous analytics endpoint',
    },
    docs: 'https://github.com/joynix28/is-it-ai-generated.org',
  }, { cacheControl: 'public, max-age=3600' });
}
