import test from 'node:test';
import assert from 'node:assert/strict';
import { todayLocal } from '../public/screens.js';

test('visit date follows the device calendar date, not the UTC date', () => {
  const prior=process.env.TZ;
  process.env.TZ='America/Los_Angeles';
  try {
    assert.equal(todayLocal(new Date('2026-10-03T04:05:00Z')), '2026-10-02');
    assert.equal(todayLocal(new Date('2026-01-01T07:30:00Z')), '2025-12-31');
  } finally {
    if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;
  }
});
