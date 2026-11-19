import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['lib/flow-calendar-view.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {maskFlowDays,monthDates,flowTimeLabel}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('overlapping and cross-month FLOW intervals expose exactly one generic date label per busy day',()=>{
 const blocks=[{id:'PRIVATE ID',title:'PRIVATE TITLE',location:'PRIVATE VENUE',startDate:'2026-12-30',endDate:'2027-01-03'},{startDate:'2027-01-02',endDate:'2027-01-04'}];
 assert.deepEqual(maskFlowDays('2027-01',blocks),['01','02','03','04'].map(day=>({date:'2027-01-'+day,label:'마감'})));assert.doesNotMatch(JSON.stringify(maskFlowDays('2026-12',blocks)),/PRIVATE|title|location|id/);assert.equal(monthDates('2028-02').length,29);assert.throws(()=>monthDates('2027-13'));
});
test('admin time labels use Korean time, all-day and unknown-end wording',()=>{
 const event={startDate:'2027-01-05',endDate:'2027-01-05',startAt:'2027-01-05T00:00:00Z',endAt:'2027-01-05T02:30:00Z',allDay:false};assert.equal(flowTimeLabel(event),'09:00–11:30');assert.equal(flowTimeLabel({...event,allDay:true}),'종일');assert.equal(flowTimeLabel({...event,endAt:null}),'09:00 · 종료 시간 미정');
});
