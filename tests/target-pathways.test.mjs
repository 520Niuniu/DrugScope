import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReactomePayload, normalizeTarget } from '../netlify/functions/target-pathways.mjs';

test('accepts bounded molecular targets and rejects unsafe query text', () => {
  assert.equal(normalizeTarget('  EGFR  '), 'EGFR');
  assert.equal(normalizeTarget('H+,K+-ATPase'), 'H+,K+-ATPase');
  assert.equal(normalizeTarget('EGFR\nTP53'), '');
  assert.equal(normalizeTarget('EGFR|TP53'), '');
  assert.equal(normalizeTarget('A'.repeat(81)), '');
});

test('normalizes, sanitizes and bounds Reactome pathway records', () => {
  const payload = normalizeReactomePayload({
    numberOfMatches: 54,
    results: [{
      typeName: 'Pathway',
      entries: [
        {
          stId: 'R-HSA-177929',
          name: 'Signaling by <span class="highlighting">EGFR</span>',
          type: 'Pathway',
          species: ['Homo sapiens'],
          summation: '<b>EGFR</b> signaling &amp; regulation',
          isDisease: false
        },
        {
          stId: 'R-HSA-177929',
          name: 'duplicate',
          type: 'Pathway',
          species: ['Homo sapiens']
        },
        {
          stId: 'R-MMU-123',
          name: 'mouse pathway',
          type: 'Pathway',
          species: ['Mus musculus']
        }
      ]
    }]
  });

  assert.equal(payload.total, 54);
  assert.equal(payload.pathways.length, 1);
  assert.deepEqual(payload.pathways[0], {
    id: 'R-HSA-177929',
    name: 'Signaling by EGFR',
    species: ['Homo sapiens'],
    summary: 'EGFR signaling & regulation',
    isDisease: false,
    url: 'https://reactome.org/content/detail/R-HSA-177929'
  });
});
