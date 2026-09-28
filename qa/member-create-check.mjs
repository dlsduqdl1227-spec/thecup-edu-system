import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Local isolated QA DB only. Never point this registration test at production.
const baseURL = 'http://127.0.0.1:5173';
const { chromium } = await import(process.env.QA_PLAYWRIGHT ? pathToFileURL(process.env.QA_PLAYWRIGHT).href : 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_BROWSER });
const admin = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
const student = await browser.newContext({ baseURL, viewport: { width: 360, height: 800 } });
const page = await admin.newPage(), pupil = await student.newPage();
const report = { checks: [], errors: [] };
for (const p of [page,pupil]) p.on('pageerror', e => report.errors.push(e.message));
const pass = label => { report.checks.push(label); console.log(`PASS ${label}`); };
const api = async (path, data) => {
  const r = data ? await admin.request.post(path, { data }) : await admin.request.get(path);
  assert.ok(r.ok(), `${path}: ${r.status()} ${await r.text()}`); return r.json();
};
const list = page.locator('.booking-admin-member-list');
const form = page.getByRole('form', { name: '수강생 추가', exact: true });
const open = async () => { await page.getByRole('button', { name: '+ 수강생 추가', exact: true }).click(); await form.waitFor(); };
const capture = async name => {
  await page.locator('.toast').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name);
  await page.screenshot({ path: `outputs/qa/${name}.png`, fullPage: true });
  if (await form.count()) await form.screenshot({ path: `outputs/qa/${name}-form.png` });
};
try {
  await mkdir('outputs/qa', { recursive: true });
  await api('/api/auth/bootstrap', { name: 'QA 운영자', phone: '01000009901', code: 'local-browser-qa', securityCode: '7319' });
  await page.goto('/admin');
  await page.locator('.side-nav').getByRole('button', { name: '수강생 목록', exact: false }).click();
  await page.getByText('등록된 수강생이 없습니다.', { exact: false }).waitFor();
  await open();
  assert.equal(await form.getByLabel('이름', { exact: true }).evaluate(el => el === document.activeElement), true);
  await form.getByLabel('이름', { exact: true }).fill('QA 직접 추가');
  await form.getByLabel('휴대폰 번호', { exact: true }).fill('123');
  await form.getByRole('button', { name: '등록·승인', exact: true }).click();
  await form.getByRole('alert').filter({ hasText: '휴대폰 번호를 정확히' }).waitFor();
  assert.equal(await form.getByLabel('이름', { exact: true }).inputValue(), 'QA 직접 추가');
  await form.getByLabel('휴대폰 번호', { exact: true }).fill('010-0000-9902');
  await form.locator('summary').click();
  await form.getByLabel('희망 스테이션').selectOption('BREWING');
  await form.getByLabel('관리자 메모').fill('로컬 직접 등록 QA');
  await capture('member-create-desktop');
  await form.getByRole('button', { name: '등록·승인', exact: true }).click();
  await form.waitFor({ state: 'detached' });
  let card = list.locator('article').filter({ hasText: 'QA 직접 추가' });
  await card.getByRole('button', { name: '관리', exact: true }).click();
  await card.getByRole('button', { name: '권한 회수' }).waitFor();
  assert.match(await card.innerText(), /9902/);
  assert.equal((await api('/api/booking/admin')).members.length, 1);
  pass('수강생 목록 직접 추가·입력 오류 안내·등록 직후 목록 갱신');

  await open();
  await form.getByLabel('이름', { exact: true }).fill('QA 중복');
  await form.getByLabel('휴대폰 번호', { exact: true }).fill('01000009902');
  await form.getByRole('button', { name: '등록·승인', exact: true }).click();
  await form.getByRole('alert').filter({ hasText: '이미 등록된' }).waitFor();
  assert.equal(await form.getByLabel('이름', { exact: true }).inputValue(), 'QA 중복');
  await form.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal((await api('/api/booking/admin')).members.length, 1);
  assert.equal(await page.getByRole('button', { name: '+ 수강생 추가', exact: true }).evaluate(el => el === document.activeElement), true);
  pass('번호 중복 차단·입력 보존·취소 시 버튼으로 키보드 포커스 복귀');

  await pupil.goto('/?view=student');
  await pupil.locator('input[name="name"]').fill('QA 직접 추가');
  await pupil.locator('input[name="phone"]').fill('01000009902');
  await pupil.getByLabel('보안코드', { exact: true }).fill('08372');
  await pupil.getByRole('button', { name: '로그인', exact: true }).click();
  await pupil.locator('.portal-mobile-nav').getByRole('button', { name: '스케줄', exact: true }).click();
  assert.equal((await student.request.get('/api/booking/member')).status(), 200);
  await pupil.locator('.portal-mobile-nav').getByRole('button', { name: '교육', exact: true }).click();
  await pupil.getByText('열람 가능한 교육자료가 없습니다.', { exact: false }).waitFor();
  pass('직접 등록한 수강생의 실제 로그인·스케줄 진입·교육자료 기본 비공개');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByLabel('수강생 검색').fill('없는 이름');
  await page.getByRole('navigation', { name: '수강생 DB 상태 필터' }).getByRole('button', { name: '회수', exact: true }).click();
  await open();
  await form.getByLabel('이름', { exact: true }).fill('QA 승인 대기');
  await form.getByLabel('휴대폰 번호', { exact: true }).fill('01000009903');
  await form.getByLabel('등록 상태').selectOption('PENDING');
  await capture('member-create-mobile-360');
  await form.getByRole('button', { name: '승인 대기로 등록', exact: true }).click();
  await form.waitFor({ state: 'detached' });
  card = list.locator('article').filter({ hasText: 'QA 승인 대기' });
  await card.waitFor();
  await card.getByRole('button', { name: '관리', exact: true }).click();
  assert.equal(await page.getByLabel('수강생 검색').inputValue(), '');
  assert.equal((await student.request.post('/api/member-auth/login', { data: { name: 'QA 승인 대기', phone: '01000009903', securityCode: '08372' } })).status(), 401);
  page.once('dialog', d => d.accept('로컬 승인'));
  await card.getByRole('button', { name: '상담 완료·승인', exact: true }).click();
  await card.getByRole('button', { name: '권한 회수', exact: true }).waitFor();
  pass('360px 추가 화면·승인 대기 등록·필터 초기화·기존 승인 기능');

  await card.getByRole('button', { name: '정보 수정', exact: true }).click();
  const edit = card.getByRole('form', { name: 'QA 승인 대기 정보 수정' });
  await edit.getByLabel('이름', { exact: true }).fill('QA 수정 확인');
  page.once('dialog', d => d.accept());
  await edit.getByRole('button', { name: '저장', exact: true }).click();
  await list.getByRole('heading', { name: /QA 수정 확인/ }).waitFor();
  await page.reload();
  await page.locator('.bottom-nav').getByRole('button', { name: '수강생', exact: true }).click();
  await list.getByRole('heading', { name: /QA 수정 확인/ }).waitFor();
  await capture('member-list-mobile-360');
  pass('기존 정보 수정 및 새로고침 후 저장 유지');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.side-nav').getByRole('button', { name: 'SCA 교육자료', exact: false }).click();
  await page.locator('.sca-access-list article').filter({ hasText: 'QA 직접 추가' }).waitFor();
  const edu = await api('/api/edu/members');
  assert.equal(edu.members.length, 2); assert.ok(edu.members.every(m => m.levels.length === 0));
  await page.getByRole('button', { name: '수강생 승인하러 가기', exact: true }).click();
  await page.getByRole('button', { name: '+ 수강생 추가', exact: true }).waitFor();
  assert.match(await list.innerText(), /QA 직접 추가/);
  await open(); await form.getByRole('button', { name: '취소', exact: true }).click();
  pass('운영·개강 상담·회원과 교육자료 목록에 같은 수강생 표시·추가 버튼 공유');
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile('outputs/qa/member-create-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
