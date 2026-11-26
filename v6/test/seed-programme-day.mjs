import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {run} = require('./dom.js').makeCtx();

for (const instant of ['2026-11-23T20:59:00.000Z', '2026-11-23T21:01:00.000Z']) {
  const stats = run(`(()=>{
    DB.load();
    seedOfficial(DB.db, new Date('${instant}'), {patients:4000});
    const days=DB.db.patients.map(p=>CARE_RULES.days(p,'${instant}'));
    return {min:Math.min(...days), max:Math.max(...days), core:days.filter(n=>n>=45&&n<=240).length,
      tail:days.filter(n=>n>=241&&n<=330).length, window:days.filter(n=>n>=60&&n<=80).length};
  })()`);
  assert.equal(stats.min >= 45 && stats.max <= 330, true, `${instant}: ${JSON.stringify(stats)}`);
  assert.equal(stats.core, 3800, instant);
  assert.equal(stats.tail, 200, instant);
  assert.equal(stats.window, 1600, instant);
}
console.log('Synthetic register uses Kenyan programme dates across midnight.');
