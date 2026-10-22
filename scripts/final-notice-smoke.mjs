import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const helper=process.env.CHROMIUM_HELPER?(await import(process.env.CHROMIUM_HELPER)).default:undefined;
const browser=await chromium.launch(helper?{executablePath:await helper.executablePath(),args:helper.args.filter(a=>a!=='--single-process'),headless:true}:{headless:true});
try {
 for(const env of ['FINAL_NOTICE_ENT','FINAL_NOTICE_EXCLAMATION_ENT']){
  assert.ok(process.env[env],`Set ${env} to the reported .ent file`);
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1100}});
  try {
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(process.env.APP_URL??'http://127.0.0.1:5173/');
   await page.getByRole('button',{name:'채점 후 성적표에 기록',exact:true}).click();
   await page.locator('#ent-files').setInputFiles(process.env[env]);
   await page.getByRole('status').filter({hasText:'1개 채점 완료 · 1개 성적표 기록'}).waitFor();
   const row=page.locator('tr.result-row');assert.equal(await row.count(),1);
   assert.equal(await row.locator('td').nth(3).innerText(),'15');
   assert.match(await row.locator('td').nth(4).innerText(),/^25/);
   assert.match(await row.innerText(),/Perfect/);assert.doesNotMatch(await row.innerText(),/검토 필요/);
   await row.click();assert.equal(await page.locator('.criterion.passed').count(),13);
   assert.match(await page.locator('.criterion').nth(10).innerText(),/통과/);
   if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/${env}.png`,fullPage:true});
   await page.getByRole('button',{name:'닫기',exact:true}).click();
   await page.getByRole('button',{name:'반별 성적표',exact:true}).click();
   await page.reload();await page.getByRole('button',{name:'반별 성적표',exact:true}).click();
   assert.equal(await page.getByRole('spinbutton',{name:'22번 수행점수',exact:true}).inputValue(),'15');
   assert.equal(await page.getByRole('textbox',{name:'22번 감점사유',exact:true}).inputValue(),'Perfect');
   await page.getByRole('button',{name:'성적표 내려받기',exact:true}).click();await page.locator('[name="format"]').selectOption('csv');
   const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'내려받기',exact:true}).click();
   const csv=await readFile(await (await waiting).path(),'utf8');
   assert.match(csv.split('\r\n')[22],/"15","10","25","Perfect","확인 완료"/);
   assert.deepEqual(errors,[]);
   console.log(`${env}: actual upload + Worker + all 13 criteria + saved/reloaded gradebook + CSV = 15/25 Perfect`);
  }finally{await context.close();}
 }
}finally{await browser.close();}
