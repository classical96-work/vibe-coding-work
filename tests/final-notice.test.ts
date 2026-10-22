import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {b,demoProject,say,text,v} from '../src/demo';
import {gradeProject,pendingCount} from '../src/grader';
import {parseEnt} from '../src/parser';
import {archiveProject} from './archive';

const endings=['번 만에 맞췄습니다.','번만에 맞췄습니다!','번 만에 맞췄습니다!!','번 만에 맞췄습니다！！！','번 만에 맞췄습니다~','번 만에 맞췄습니다 😊','회 만에 맞췄습니다!','번 만에 맞췄습니다'];
describe('⑪ 횟수 안내의 끝 문장부호로 감점하지 않음',()=>{
 for(const env of ['FINAL_NOTICE_ENT','FINAL_NOTICE_EXCLAMATION_ENT'])it.skipIf(!process.env[env])(`사용자 제보 실제 파일 ${env}: 전 항목 만점`,()=>{
  const p=parseEnt(new Uint8Array(readFileSync(process.env[env]!))),g=gradeProject(p);
  console.log(env,{performance:g.performance,total:g.total,reasons:g.reasons,pending:pendingCount(g)});
  expect(g.performance).toBe(15);expect(g.total).toBe(25);expect(g.reasons).toBe('Perfect');expect(pendingCount(g)).toBe(0);
 });
 it.each(endings)('%s',ending=>{
  const p=demoProject();p.objects[0].script[0][5]=say(b('combine_something',[null,v('count'),null,text(ending),null]));
  const g=gradeProject(parseEnt(archiveProject(p)));
  expect(g.criteria[10].deduction).toBe(0);expect(g.criteria[10].review).toBeUndefined();expect(g.performance).toBe(15);expect(pendingCount(g)).toBe(0);
 });
 it.skipIf(!process.env.SAMPLE_ENT)('기존 실제 샘플의 마지막 안내에 느낌표를 붙여도 점수가 같음',()=>{
  const p=parseEnt(new Uint8Array(readFileSync(process.env.SAMPLE_ENT!)));
  const original=gradeProject(p);
  for(const o of p.objects)for(const thread of o.script){
   const last=thread.at(-1);
   if(last&&['dialog','dialog_time'].includes(last.type)){
    const append=(value:unknown):void=>{
     if(!value||typeof value!=='object')return;
     const block=value as {type:string;params?:unknown[]};
     if(block.type==='text'&&block.params&&typeof block.params[0]==='string'&&/번|회/.test(block.params[0]))block.params[0]=block.params[0].replace(/[.!~]*$/,'!');
     else block.params?.forEach(append);
    };
    append(last.params?.[0]);
   }
  }
  const updated=gradeProject(parseEnt(archiveProject(p)));
  expect(updated.performance).toBe(original.performance);expect(updated.criteria[10].deduction).toBe(0);expect(updated.criteria[10].review).toBeUndefined();
 });
});
