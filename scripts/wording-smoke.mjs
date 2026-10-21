import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {demoProject,say} from '../src/demo.ts';
import {archiveProject} from '../tests/archive.ts';

const helper=process.env.CHROMIUM_HELPER?(await import(process.env.CHROMIUM_HELPER)).default:undefined;
const browser=await chromium.launch(helper?{executablePath:await helper.executablePath(),args:helper.args.filter(a=>a!=='--single-process'),headless:true}:{headless:true});
const page=await browser.newPage({acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const cases=[
 ['숫자를 맟추다','큼','작음',15,0],
 ['숫자 맟췄봐','큽니당','작슴니다',15,0],
 ['숫자 맛춰봐','더 커','더 작아',15,0],
 ['숫자 맟춰봐','작음','큼',13,0],
 ['숫자를 맟추지 마세요','큼','작음',13,0],
 ['내 이름을 맟췄봐','큼','작음',13,0],
 ['숫자 맟췄봐','정답보다 작음','정답보다 큼',15,2],
];
try {
 await page.goto(process.env.APP_URL??'http://127.0.0.1:5173/');
 await page.getByRole('button',{name:'채점 후 성적표에 기록',exact:true}).click();
 await page.locator('#ent-files').setInputFiles(cases.map(([intro,big,small],i)=>{
  const p=demoProject();p.objects[0].script[0][3]=say(intro);
  p.objects[0].script[0][4].statements[0][2].statements[1][0].statements=[[say(big)],[say(small)]];
  return {name:`2010${i+1}_표현${i+1}.ent`,mimeType:'application/octet-stream',buffer:Buffer.from(archiveProject(p))};
 }));
 await page.getByRole('status').filter({hasText:'7개 채점 완료'}).waitFor();
 const rows=page.locator('tr.result-row');assert.equal(await rows.count(),7);
 for(let i=0;i<cases.length;i++){
  const [, , ,score,pending]=cases[i],row=rows.nth(i);
  assert.equal(await row.locator('td').nth(3).innerText(),String(score));
  assert.match(await row.innerText(),pending?/검토 필요 2/:/성적표 기록됨/);
  if(!pending)assert.doesNotMatch(await row.innerText(),/검토 필요/);
  if(i<3)assert.match(await row.innerText(),/Perfect/);
  await row.click();
  if(i<3)for(const index of [4,7,8])assert.match(await page.locator('.criterion').nth(index).innerText(),/통과/);
  if(i===3)for(const index of [7,8])assert.match(await page.locator('.criterion').nth(index).innerText(),/−1점/);
  if(i===4||i===5)assert.match(await page.locator('.criterion').nth(4).innerText(),/−2점/);
  await page.getByRole('button',{name:'닫기',exact:true}).click();
 }
 await page.getByRole('button',{name:'반별 성적표',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'반별 성적표',exact:true}).click();
 for(let i=0;i<cases.length;i++)assert.equal(await page.getByRole('spinbutton',{name:`${i+1}번 수행점수`,exact:true}).inputValue(),String(cases[i][3]));
 await page.getByRole('button',{name:'성적표 내려받기',exact:true}).click();
 await page.locator('[name="format"]').selectOption('csv');
 const downloadWait=page.waitForEvent('download');await page.getByRole('button',{name:'내려받기',exact:true}).click();
 const csv=await readFile(await (await downloadWait).path(),'utf8');
 const lines=csv.split('\r\n');
 for(let i=0;i<3;i++)assert.match(lines[i+1],/"15","10","25","Perfect","확인 완료"/);
 assert.match(lines[4],/"13","10","23"/);assert.match(lines[4],/⑧[\s\S]*⑨/);
 assert.match(csv,/검토 필요 · 잠정 점수/);
 assert.deepEqual(errors,[]);
 console.log('PASS: 오타·축약 표현 .ent 채점/통과, 방향 반대·부정·무관한 안내 감점, 모호한 주어 검토, 저장·새로고침·CSV 반영');
} finally {await browser.close();}
