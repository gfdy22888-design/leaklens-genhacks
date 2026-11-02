import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleData,toCSV,parseCSV,analyze} from '../dist/engine.js';
test('CSV round-trip preserves missing values and measured volume',()=>{
  const rows=sampleData();assert.deepEqual(parseCSV(toCSV(rows)),rows);
  const a=analyze(rows);assert.equal(a.missingReadings,20);assert.equal(a.referenceWindows,24);
  assert.equal(a.observedLitres,Number(rows.reduce((s,r)=>s+(r.flow_lpm??0),0).toFixed(1)));
});
test('continuous small-flow scenario overlaps the injected interval',()=>{
  const a=analyze(sampleData('leak'));
  assert.ok(a.events.some(e=>e.category==='continuous'&&e.firstWindow*15<920&&(e.lastWindow+1)*15>800));
  assert.ok(a.events.filter(e=>e.category==='continuous').every(e=>e.windows.every(i=>a.windows[i].onMinutes===15)));
});
test('planned irrigation also gets flagged: the model cannot diagnose the cause',()=>{
  assert.ok(analyze(sampleData('irrigation')).events.some(e=>e.category==='continuous'&&e.firstWindow*15<480&&(e.lastWindow+1)*15>435));
});
test('missing windows have no model score, and no fake zero readings',()=>{
  const rows=sampleData('gap');const a=analyze(rows);
  assert.ok(a.events.some(e=>e.category==='quality'&&e.missing===20));
  a.windows.filter(w=>w.missing).forEach(w=>assert.equal(w.score,null));
  assert.equal(rows[1095].flow_lpm,null);
});
test('reference selection can absorb the anomaly; no diagnostic guarantee',()=>{
  const rows=sampleData('leak').slice(800,1040);const a=analyze(rows,{baselineMinutes:120});
  assert.ok(a.windows.slice(0,8).every(w=>w.kind==='reference'));
});
test('malformed, negative, unordered and unzoned input is rejected',()=>{
  const csv=toCSV(sampleData('normal').slice(0,120));
  for(const bad of [csv.replace('flow_lpm','rate'),csv.replace(',0\n',',-1\n'),csv.replace('00:01:00.000Z','00:00:00.000Z'),csv.replace('00:00:00.000Z','00:00:00'),csv.replace(',0\n',',Infinity\n'),csv.replace(',0\n',',0x10\n'),csv.replace('2026-11-02','2026-02-30')])assert.throws(()=>parseCSV(bad));
  assert.throws(()=>analyze(sampleData(),{baselineMinutes:1440}));
});
test('partial final window is reported without pretending a complete observation',()=>{
  const a=analyze(sampleData().slice(0,121),{baselineMinutes:60});
  assert.equal(a.windows.at(-1).partial,true);assert.equal(a.windows.at(-1).score,null);
  assert.ok(a.events.some(e=>e.category==='quality'));
});
