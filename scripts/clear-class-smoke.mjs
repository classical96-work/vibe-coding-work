import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {demoProject,b} from '../src/demo.ts';
import {archiveProject} from '../tests/archive.ts';
const helper=process.env.CHROMIUM_HELPER?(await import(process.env.CHROMIUM_HELPER)).default:undefined;
const browser=await chromium.launch(helper?{executablePath:await helper.executablePath(),args:helper.args.filter(a=>a!=='--single-process'),headless:true}:{headless:true});
const url=process.env.APP_URL??'http://127.0.0.1:5173/';
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
let confirmDelete=false,confirmCount=0;
page.on('dialog',dialog=>{
 if(dialog.type()==='confirm'&&dialog.message().includes('채점 및 검토 기록을 지울까요')){
  assert.match(dialog.message(),/2학년 1반/);assert.match(dialog.message(),/이름 명단과 다른 반의 성적은 유지/);confirmCount++;return confirmDelete?dialog.accept():dialog.dismiss();
 }
 return dialog.accept();
});
const file=(id,p=demoProject())=>({name:`${id}_검증학생.ent`,mimeType:'application/octet-stream',buffer:Buffer.from(archiveProject(p))});
const saved=async()=>{
 await page.locator('#save-status').filter({hasText:'이 브라우저에 저장됨'}).waitFor();
 return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('entry-grading-notebook',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('notebook','readonly'),get=tx.objectStore('notebook').get('current');tx.oncomplete=()=>{db.close();resolve(get.result);};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}));
};
try{
 await page.goto(url);await page.getByRole('button',{name:'반별 성적표',exact:true}).click();assert.equal(await page.getByRole('button',{name:'이 반 성적 비우기'}).isDisabled(),true);
 await page.getByRole('button',{name:'간편 채점',exact:true}).click();await page.getByRole('button',{name:/기본점수 10점/}).click();await page.locator('[name="base"]').fill('8');await page.locator('[name="rows"]').fill('35');await page.getByRole('button',{name:'설정 저장'}).click();
 await page.getByRole('button',{name:'채점 후 성적표에 기록',exact:true}).click();const pending=demoProject();pending.objects[0].script[0].push(b('wait_second'));
 await page.locator('#ent-files').setInputFiles([file('20101',pending),file('20201'),file('10102')]);await page.getByRole('status').filter({hasText:'3개 채점 완료 · 2개 성적표 기록'}).waitFor();
 await page.getByRole('button',{name:'반별 성적표',exact:true}).click();await page.getByRole('textbox',{name:'1번 이름',exact:true}).fill('명단유지');await page.getByRole('textbox',{name:'1번 이름',exact:true}).press('Tab');
 await page.getByRole('spinbutton',{name:'1번 수행점수',exact:true}).fill('12');await page.getByRole('spinbutton',{name:'1번 수행점수',exact:true}).press('Tab');
 await page.getByRole('textbox',{name:'1번 감점사유',exact:true}).fill('수동 검토 사유');await page.getByRole('textbox',{name:'1번 감점사유',exact:true}).press('Tab');
 const before=await saved();assert.equal(before.classes[1][1].performance,12);assert.ok(before.classes[1][1].submission);
 await page.getByRole('button',{name:'이 반 성적 비우기'}).click();assert.deepEqual(await saved(),before);
 confirmDelete=true;await page.getByRole('button',{name:'이 반 성적 비우기'}).click();await page.getByRole('status').filter({hasText:'1반 성적을 비웠습니다'}).waitFor();
 const after=await saved();assert.deepEqual(after.classes[1][1],{name:'명단유지'});assert.deepEqual(after.classes[2],before.classes[2]);assert.deepEqual(after.settings,before.settings);assert.equal(after.revision,before.revision+1);assert.equal(confirmCount,2);assert.equal(await page.getByRole('button',{name:'이 반 성적 비우기'}).isDisabled(),true);
 await page.getByRole('button',{name:'검토함',exact:true}).click();await page.getByRole('heading',{name:'검토할 작품이 없어요'}).waitFor();
 await page.getByRole('button',{name:'간편 채점',exact:true}).click();assert.equal(await page.locator('.result-row').count(),1);assert.match(await page.locator('.result-row').innerText(),/10102/);
 await page.getByRole('button',{name:'2반',exact:true}).click();assert.equal(await page.locator('.result-row').count(),1);assert.match(await page.locator('.result-row').innerText(),/20201/);
 console.log('PASS: 선택 반 확인·취소 보존, 점수/사유/상세/검토/결과 삭제, 명단·다른 반·다른 학년 결과·설정 보존');
 await page.reload();await page.getByRole('button',{name:'반별 성적표',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'1번 이름',exact:true}).inputValue(),'명단유지');assert.equal(await page.getByRole('spinbutton',{name:'1번 수행점수',exact:true}).inputValue(),'');assert.equal(await page.getByRole('spinbutton',{name:'1번 기본점수',exact:true}).inputValue(),'');assert.equal(await page.getByRole('textbox',{name:'1번 감점사유',exact:true}).inputValue(),'');assert.equal(await page.getByRole('button',{name:'1번 채점 상세',exact:true}).count(),0);
 await page.getByRole('button',{name:'성적표 내려받기',exact:true}).click();await page.locator('[name="scope"]').selectOption('all');await page.locator('[name="format"]').selectOption('csv');const wait=page.waitForEvent('download');await page.getByRole('button',{name:'내려받기',exact:true}).click();const csv=await wait,lines=(await readFile(await csv.path(),'utf8')).split('\r\n');assert.equal(lines[1],'"1","1","명단유지","","","","","미채점"');assert.match(lines[36],/^"2","1","검증학생","15","8","23"/);
 await page.getByRole('button',{name:'2반',exact:true}).click();assert.equal(await page.getByRole('spinbutton',{name:'1번 수행점수',exact:true}).inputValue(),'15');
 await page.getByRole('button',{name:'간편 채점',exact:true}).click();await page.getByRole('button',{name:'채점 후 성적표에 기록',exact:true}).click();await page.locator('#ent-files').setInputFiles(file('20101'));await page.getByRole('status').filter({hasText:'1개 채점 완료 · 1개 성적표 기록'}).waitFor();
 await page.getByRole('button',{name:'반별 성적표',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'1번 이름',exact:true}).inputValue(),'명단유지');assert.equal(await page.getByRole('spinbutton',{name:'1번 수행점수',exact:true}).inputValue(),'15');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.getByRole('button',{name:'이 반 성적 비우기'}).isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS: 삭제의 IndexedDB 저장·새로고침·CSV 확인, 다른 반 점수 유지, 재채점·이름 유지, 모바일 버튼');
}finally{await browser.close();}
