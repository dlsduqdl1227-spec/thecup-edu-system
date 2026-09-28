import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { layoutDeck } from '../lib/sca-edu/layouts.js';

const read = course => JSON.parse(readFileSync(new URL(`../lib/sca-edu/decks/${course}/foundation.json`, import.meta.url), 'utf8'));
const water = read('water-maintenance'), sustainability = read('sustainability');
const model = (deck, id) => deck.caseStudies.find(c => c.id === id).model;
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 0.0001, `${value} != ${expected}`);
const mean = values => values.reduce((a,b) => a+b, 0) / values.length;

test('each foundation has six fictional evidence-question-solution cases within the existing curriculum', () => {
  for (const [deck, baseCount] of [[water,52],[sustainability,55]]) {
    assert.equal(deck.status, 'review');
    assert.equal(deck.level, 'Foundation');
    assert.equal(deck.caseStudies.length, 6);
    assert.equal(new Set(deck.caseStudies.map(c=>c.id)).size, 6);
    assert.equal(deck.slides.filter(s=>s.caseIndex).length, 1);
    assert.equal(deck.slides.filter(s=>!s.caseId && !s.caseIndex && !s.beginnerGuide).length, baseCount);
    const laid = layoutDeck(deck);
    for (const c of deck.caseStudies) {
      const indexes = deck.slides.flatMap((s,i)=>s.caseId===c.id ? [i] : []);
      const pages = indexes.map(i=>deck.slides[i]);
      assert.deepEqual(indexes, [indexes[0],indexes[0]+1,indexes[0]+2]);
      assert.deepEqual(pages.map(s=>s.caseStage), ['evidence','question','solution']);
      assert.ok(['table','chart'].includes(pages[0].layout));
      assert.match(pages[0].lead, /가상/);
      assert.equal(pages[1].layout, 'question');
      assert.ok(pages[1].q && pages[1].a && pages[1].notes);
      assert.match(pages[1].eyebrow, /가상 사례/);
      assert.ok(['compare','stats','steps'].includes(pages[2].layout));
      for (const i of indexes) {
        assert.match(deck.slides[i].notes, /개념 출처:/);
        for (const shape of laid[i].shapes) {
          if (shape.t==='text' && shape.h>0.5 && shape.y<6.1) assert.ok(shape.size>=17, `${c.id}: small body`);
          if (shape.t==='table') assert.ok(shape.size>=16, `${c.id}: small table`);
        }
      }
    }
  }
});

test('water examples preserve the blending, capacity, flow and repeated-dose calculations', () => {
  const blend=model(water,'water-blending');
  near((blend.targetAlkalinity-blend.treatedAlkalinity)/(blend.rawAlkalinity-blend.treatedAlkalinity),0.3);
  near(blend.totalMl*blend.rawFraction,600);
  near(blend.totalMl*(1-blend.rawFraction),1400);
  near(blend.rawHardness*.3+blend.treatedHardness*.7,61);
  const life=model(water,'filter-life'), remaining=life.ratedLitres-life.usedLitres;
  near(remaining/life.oldDailyLitres,70); near(remaining/life.newDailyLitres,42);
  const flow=model(water,'filter-flow');
  near(flow.volumeMl/1000/flow.oldSeconds*60,3); near(flow.volumeMl/1000/flow.newSeconds*60,1.5);
  const dose=model(water,'grinder-repeatability');
  near(mean(dose.before),18); near(mean(dose.after),18);
  near(Math.max(...dose.before)-Math.min(...dose.before),2.1);
  near(Math.max(...dose.after)-Math.min(...dose.after),0.2);
  const chart=water.slides.find(s=>s.caseId==='grinder-repeatability' && s.chart).chart;
  assert.deepEqual(chart.series.map(s=>s.values),[dose.before,dose.after]);
  const profile=model(water,'water-profile');
  const profileChart=water.slides.find(s=>s.caseId==='water-profile' && s.chart).chart;
  assert.deepEqual(profileChart.series.map(s=>s.values),[profile.hardness,profile.alkalinity]);
  assert.deepEqual(profile.tds,[150,150]);
});

test('sustainability examples keep denominators, cash boundaries and claims distinct', () => {
  const farmer=model(sustainability,'farmer-price');
  for(let i=0;i<2;i++) {
    near(farmer.quantity[i]*farmer.price[i],farmer.revenue[i]);
    near(farmer.revenue[i]-farmer.cost[i],farmer.surplus[i]);
  }
  const cert=model(sustainability,'certification-cost');
  near(cert.premiumSoldKg*cert.premiumPerKg,900);
  near(cert.premiumSoldKg*cert.premiumPerKg-cert.auditCost-cert.recordCost,-400);
  const cups=model(sustainability,'reuse-cups');
  near(cups.returnedByCutoff/cups.issued*100,90);
  assert.equal(cups.issued-cups.returnedByCutoff,cups.unreturnedByCutoff);
  const power=model(sustainability,'energy-intensity');
  near(power.kwh[1]/power.kwh[0]*100,110);
  near((power.kwh[1]/power.cups[1])/(power.kwh[0]/power.cups[0])*100,power.indexPerCup[1]);
  const energyChart=sustainability.slides.find(s=>s.caseId==='energy-intensity' && s.chart).chart;
  assert.deepEqual(energyChart.series[1].values,[110,91.67]);
  const waste=model(sustainability,'waste-claims');
  for(let i=0;i<2;i++) near(waste.wasteKg[i]/waste.inputKg[i]*100,waste.wasteRate[i]);
  near((1-waste.wasteRate[1]/waste.wasteRate[0])*100,25);
  near((1-waste.wasteKg[1]/waste.wasteKg[0])*100,10);
  const training=model(sustainability,'training-equity');
  assert.equal(training.before.reduce((a,b)=>a+b,0),4);
  assert.equal(training.after.reduce((a,b)=>a+b,0),10);
});
