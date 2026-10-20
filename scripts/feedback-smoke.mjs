import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import {stat,readFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {demoProject,b,say,text,compare} from '../src/demo.ts';
import {archiveProject} from '../tests/archive.ts';
const helper=process.env.CHROMIUM_HELPER?(await import(process.env.CHROMIUM_HELPER)).default:undefined;
const browser=await chromium.launch(helper?{executablePath:await helper.executablePath(),args:helper.args.filter(arg=>arg!=='--single-process'),headless:true}:{headless:true});
const url=process.env.APP_URL??'http://127.0.0.1:5173/';
const errors=[];
async function pageFor(context){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(url);await p.getByRole('heading',{name:'숫자맞추기, 채점은 가볍게.'}).waitFor();return p;}
function upload(project,id,name){return{name:`${id}_${name}.ent`,mimeType:'application/octet-stream',buffer:Buffer.from(archiveProject(project))};}
const body=p=>p.objects[0].script[0][4].statements[0];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),p=await pageFor(context);
 await p.getByRole('button',{name:'채점 후 성적표에 기록',exact:true}).click();
 const broken=demoProject(),t=broken.objects[0].script[0];t[1].params[0]='missing';t[2].params[1]=text(5);t[3]=say('안녕');body(broken).splice(1,1);t.push(b('wait_second',[text(1)]));
 const sound=demoProject();body(sound)[2].statements[0].unshift(b('sound_something_with_block'));
 const remainder=demoProject();body(remainder)[2]=b('if_else',[compare('GREATER')],[[say('그것보다 큽니다')],[b('if_else',[compare('LESS')],[[say('그것보다 작습니다')],[say('정답입니다'),b('stop_repeat')]])]]);
 const ambiguous=demoProject();body(ambiguous)[2].statements[1][0].statements=[[say('정답보다 작아요')],[say('정답보다 커요')]];
 await p.locator('#ent-files').setInputFiles([upload(broken,'20101','감점검증'),upload(sound,'20102','소리검증'),upload(remainder,'20103','나머지분기'),upload(ambiguous,'20104','주어검토')]);
 await p.getByRole('status').filter({hasText:'4개 채점 완료'}).waitFor();
 const rows=p.locator('.result-row');assert.equal(await rows.count(),4);assert.equal(await rows.nth(0).locator('td').nth(3).innerText(),'9');assert.match(await rows.nth(0).innerText(),/③/);assert.doesNotMatch(await rows.nth(1).innerText(),/Perfect/);assert.equal(await rows.nth(2).locator('td').nth(3).innerText(),'15');assert.match(await rows.nth(2).innerText(),/Perfect/);assert.match(await rows.nth(3).innerText(),/검토 필요 2/);
 await rows.nth(0).click();assert.match(await p.locator('.criterion').nth(2).innerText(),/난수를 정답 변수에 저장하지 않음/);await p.getByRole('button',{name:'구조를 확인했습니다'}).click();assert.match(await p.locator('.detail-score').innerText(),/9[\s\S]*19/);await p.getByRole('button',{name:'닫기',exact:true}).click();
 await p.getByRole('button',{name:'반별 성적표',exact:true}).click();await p.getByRole('button',{name:'성적표 내려받기',exact:true}).click();
 const wait=p.waitForEvent('download');await p.getByRole('button',{name:'내려받기',exact:true}).click();const xlsx=await wait;
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(await xlsx.path());const sheet=wb.worksheets[0];assert.equal(sheet.getCell('C2').value,9);assert.match(sheet.getCell('F2').value,/③/);assert.match(sheet.getCell('G3').value,/검토/);assert.doesNotMatch(sheet.getCell('F3').value,/Perfect/);
 await p.reload();await p.getByRole('button',{name:'반별 성적표',exact:true}).click();assert.equal(await p.getByRole('spinbutton',{name:'1번 수행점수',exact:true}).inputValue(),'9');
 await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));const geometry=await p.locator('.sidebar').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:innerHeight}));assert.equal(geometry.top,0);assert.equal(geometry.bottom,geometry.height);
 console.log('PASS: 9점+대기 블록, 원래 감점·사유 보존, 소리/나머지 정답 분기/주어 검토, XLSX 판정상태, IndexedDB 새로고침, 긴 페이지 메뉴');
 await context.close();
 const migrationContext=await browser.newContext();
 const old={version:1,settings:{base:10,rows:33,gradeLevel:2},classes:{7:{12:{name:'이전학생',performance:15,base:10,reasons:'Perfect',submission:{key:'legacy',fileName:'20712_이전학생.ent',student:{id:'20712',grade:2,classNo:7,number:12,name:'이전학생'},grade:{criteria:Array.from({length:13},(_,i)=>({id:i+1,label:'이전항목',max:[4,9].includes(i)?2:1,deduction:0,reason:'이전판정'})),naming:[],notices:[],performance:15,base:10,total:25,reasons:'Perfect'},pseudocode:'보존할 구조',received:'2026-10-20'}}}},revision:2,backedUpRevision:1};
 await migrationContext.addInitScript(data=>{if(!localStorage.getItem('entry-grading-notebook.v1'))localStorage.setItem('entry-grading-notebook.v1',JSON.stringify(data));},old);
 const m=await pageFor(migrationContext);await m.getByRole('alert').filter({hasText:'이전 버전의 채점 결과'}).waitFor();await m.getByRole('button',{name:'반별 성적표',exact:true}).click();await m.getByRole('button',{name:'7반',exact:true}).click();assert.equal(await m.getByRole('textbox',{name:'12번 이름',exact:true}).inputValue(),'이전학생');assert.doesNotMatch(await m.getByRole('textbox',{name:'12번 감점사유',exact:true}).inputValue(),/Perfect/);assert.equal(await m.evaluate(()=>!!localStorage.getItem('entry-grading-notebook.v1')),true);await migrationContext.close();
 console.log('PASS: 실제 브라우저에서 localStorage 원본 보존·IndexedDB 이전·이전 결과 재채점 경고');
 const batchContext=await browser.newContext(),batch=await pageFor(batchContext);
 await batch.getByRole('button',{name:/기본점수 10점/}).click();await batch.locator('[name="rows"]').fill('50');await batch.getByRole('button',{name:'설정 저장'}).click();await batch.getByRole('button',{name:'채점 후 성적표에 기록',exact:true}).click();
 const files=[];for(let c=1;c<=6;c++)for(let n=1;n<=50;n++)files.push(upload(demoProject(),`2${String(c).padStart(2,'0')}${String(n).padStart(2,'0')}`,'일괄검증'));
 await batch.locator('#ent-files').setInputFiles(files);await batch.getByRole('status').filter({hasText:'300개 채점 완료 · 300개 성적표 기록'}).waitFor({timeout:120000});
 await batch.getByRole('button',{name:'반별 성적표',exact:true}).click();await batch.getByText('기록된 작품 300개',{exact:false}).waitFor();await batch.reload();await batch.getByRole('button',{name:'반별 성적표',exact:true}).click();await batch.getByText('기록된 작품 300개',{exact:false}).waitFor();
 await batch.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('entry-grading-notebook',1);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('notebook','readwrite'),store=tx.objectStore('notebook'),get=store.get('current');get.onsuccess=()=>{const data=get.result;for(const rows of Object.values(data.classes))for(const row of Object.values(rows))row.submission.pseudocode='x'.repeat(24000);store.put(data,'current');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);
 }));
 await batch.reload();await batch.getByRole('button',{name:'반별 성적표',exact:true}).click();await batch.getByText('기록된 작품 300개',{exact:false}).waitFor();
 const backupWait=batch.waitForEvent('download');await batch.getByRole('button',{name:'백업 내보내기',exact:true}).click();const backup=await backupWait,backupPath=await backup.path();assert.ok((await stat(backupPath)).size>5*1024*1024);assert.equal(JSON.parse(await readFile(backupPath,'utf8')).classes[6][50].submission.pseudocode.length,24000);
 await batch.getByRole('button',{name:'백업 불러오기',exact:true}).click();await batch.locator('#restore-file').setInputFiles(backupPath);await batch.getByRole('status').filter({hasText:'백업을 불러왔습니다'}).waitFor();
 await batchContext.close();console.log('PASS: 실제 .ent 300개 단일 배치·기록·새로고침, 5MB 초과 IndexedDB 저장·JSON 백업·앱 내 복원');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
