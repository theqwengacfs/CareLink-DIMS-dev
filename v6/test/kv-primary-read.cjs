/* Shared fixture for the primary-verified conditional read. It emulates only
   the read protocol; CAS and session-lease behavior remain in each strict mock.
   A digest match must be against the exact raw value, not its revision/head. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function isSnapshotRead(script) {
  return typeof script === 'string' && script.startsWith('-- carelink-primary-snapshot-v1\n');
}
function conditionalPrimaryRead(store, key, knownDigest) {
  assert.equal(key, 'carelink_cloud_v66');
  const value = store.get(key);
  if (value == null) return ['missing', null];
  assert.equal(typeof value, 'string');
  const digest = crypto.createHash('sha1').update(value).digest('hex');
  return [digest, digest === knownDigest ? null : value];
}
function encodeRespFixture(value) {
  if (value == null) return '$-1\r\n';
  if (Array.isArray(value)) return `*${value.length}\r\n` + value.map(encodeRespFixture).join('');
  const string = String(value);
  return `$${Buffer.byteLength(string)}\r\n${string}\r\n`;
}
module.exports = { isSnapshotRead, conditionalPrimaryRead, encodeRespFixture };
