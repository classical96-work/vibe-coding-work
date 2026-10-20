import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {demoProject,say,text} from '../src/demo.ts';
import {archiveProject} from '../tests/archive.ts';

const helper=process.env.CHROMIUM_HELPER?(await import(process.env.CHROMIUM_HELPER)).default:undefined;
const browser=await chromium.launch(helper?{executablePath:await helper.executablePath(),args:helper.args.filter(a=>a!=='--single-process'),headless:true}:{headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(process.env.APP_URL??'http://127.0.0.1:5173/');
 await page.getByRole('heading',{name:'숫자맞추기, 채점은 가볍게.'}).waitFor();
 const messages=['내가 생각한 숫자를 맞춰봐.','숫자 맞춰봐.','내가 생각한 숫자가 뭐게?','1~10사이의 수 중 하나를 맞혀봐','안녕하세요!','내 이름을 맞춰봐','숫자 맞춰봐'];
 await page.locator('#ent-files').setInputFiles(messages.map((message,i)=>{
  const p=demoProject();p.objects[0].script[0][3]=say(message);
  if(i===6)p.objects[0].script[0][2].params[1].params[3]=text(100);
  return {name:`2010${i+1}_확인${i+1}.ent`,mimeType:'application/octet-stream',buffer:Buffer.from(archiveProject(p))};
 }));
 await page.getByRole('status').filter({hasText:'7개 채점 완료'}).waitFor();
 const rows=page.locator('tr.result-row');assert.equal(await rows.count(),7);
 for(let i=0;i<7;i++){
  const row=rows.nth(i);
  const expected=i<4?15:i<6?13:14;
  assert.equal(await row.locator('td').nth(3).innerText(),String(expected));
  assert.doesNotMatch(await row.innerText(),/검토 필요/);
  if(i<4)assert.match(await row.innerText(),/Perfect/);
  await row.click();
  const criterion=page.locator('.criterion').nth(4);
  assert.match(await criterion.innerText(),i<4||i===6?/통과/:/−2점/);
  assert.doesNotMatch(await criterion.innerText(),/검토 필요/);
  if(i===6)assert.match(await page.locator('.criterion').nth(2).innerText(),/−1점/);
  await page.getByRole('button',{name:'닫기',exact:true}).click();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: 실제 .ent 업로드 → 세 가지 요청 문구/범위 문구 인정·무관한 문구 거부·실제 난수 범위 별도 감점·검토 표시 없음');
} finally {await browser.close();}
