import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['lib/flow-window.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {normalizeFlowWindow:window,flowWindowOverlaps:overlaps}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('real stored times take priority over the unknown-end flag, without extending to midnight',()=>{
 const block=window({start:'2027-01-05T14:00',end:'2027-01-05T15:00',endUnknown:true});assert.equal(block.blockEndAt,'2027-01-05T15:00:00.000+09:00');assert.equal(overlaps(block,'2027-01-05T09:00','2027-01-05T11:30'),false);assert.equal(overlaps(block,'2027-01-05T12:30','2027-01-05T15:00'),true);assert.equal(overlaps(block,'2027-01-05T15:00','2027-01-05T18:00'),false);
});
test('midnight is exclusive, Korean offsets match UTC, and only explicit all-day/date-only ranges cover whole days',()=>{
 const midnight=window({start:'2027-01-05T23:00',end:'2027-01-06T00:00'});assert.equal(midnight.endDate,'2027-01-05');assert.equal(overlaps(midnight,'2027-01-06T00:00','2027-01-06T11:30'),false);
 assert.deepEqual(window({start:'2027-01-05T05:00:00Z',end:'2027-01-05T06:00:00Z'}),window({start:'2027-01-05T14:00',end:'2027-01-05T15:00'}));
 const day=window({start:'2027-01-05',end:'2027-01-06',allDay:true});assert.equal(day.blockStartAt,'2027-01-05T00:00:00.000+09:00');assert.equal(day.blockEndAt,'2027-01-07T00:00:00.000+09:00');assert.equal(overlaps(day,'2027-01-06T15:30','2027-01-06T18:00'),true);
});
test('a genuinely missing finishing time is marked for the administrator instead of closing the day',()=>{
 const pending=window({start:'2027-01-05T10:00',endUnknown:true});assert.equal(pending.timingPending,true);assert.equal(overlaps(pending,'2027-01-05T09:00','2027-01-05T11:30'),false);assert.throws(()=>window({start:'2027-02-30T10:00',end:'2027-03-01T11:00'}));assert.throws(()=>window({start:'2027-01-05T11:00',end:'2027-01-05T10:00'}));
});
