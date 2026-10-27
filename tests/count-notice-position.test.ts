import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {b,compare,demoProject,say} from '../src/demo';
import {gradeProject,pendingCount} from '../src/grader';
import {parseEnt} from '../src/parser';
import type {Project} from '../src/types';
const thread=(p:Project)=>p.objects[0].script[0];
const body=(p:Project)=>thread(p)[4].statements![0];
const eq=(p:Project)=>body(p)[2];
function inline(){const p=demoProject(),notice=thread(p).pop()!;eq(p).statements![0].splice(1,0,notice);return p;}
describe('⑪ 정답 후 횟수 안내는 반복문 밖 또는 중단 직전 모두 인정',()=>{
 it.skipIf(!process.env.INLINE_NOTICE_ENT)('제보 실제 파일: 정답 안내→횟수 안내→중단은 확정 만점',()=>{
  const g=gradeProject(parseEnt(new Uint8Array(readFileSync(process.env.INLINE_NOTICE_ENT!))));
  expect(g.performance).toBe(15);expect(g.total).toBe(25);expect(pendingCount(g)).toBe(0);expect(g.reasons).toBe('Perfect');
 });
 it('정답 분기의 반복 중단 전에 횟수 안내를 해도 통과',()=>{
  const g=gradeProject(inline());expect(g.reasons).toBe('Perfect');expect(pendingCount(g)).toBe(0);
 });
 it('횟수 안내 뒤에 다른 말하기 블록이 있어도 인정',()=>{
  const p=inline();eq(p).statements![0].splice(2,0,say('수고했어요!'));expect(gradeProject(p).reasons).toBe('Perfect');
 });
 it('크기 비교 뒤 남은 정답 분기에서 안내해도 인정',()=>{
  const p=inline(),success=eq(p).statements![0];
  body(p)[2]=b('if_else',[compare('GREATER')],[[say('그것보다 큽니다')],[b('if_else',[compare('LESS')],[[say('그것보다 작습니다')],success])]]);
  expect(gradeProject(p).reasons).toBe('Perfect');
 });
 it('반복 중단 뒤 정답 분기에 놓인 실행 불가능한 안내는 감점',()=>{
  const p=inline(),xs=eq(p).statements![0];[xs[1],xs[2]]=[xs[2],xs[1]];
  expect(gradeProject(p).criteria[10].deduction).toBe(1);
 });
 it('오답 분기에서만 하는 안내는 감점',()=>{
  const p=inline(),notice=eq(p).statements![0].splice(1,1)[0];eq(p).statements![1].unshift(notice);
  expect(gradeProject(p).criteria[10].deduction).toBe(1);
 });
 it('입력 직후 매번 하는 공통 안내는 종료 안내로 인정하지 않음',()=>{
  const p=inline(),notice=eq(p).statements![0].splice(1,1)[0];body(p).splice(2,0,notice);
  expect(gradeProject(p).criteria[10].deduction).toBe(1);
 });
 it('정답 횟수를 올리기 전에 말해서 마지막 횟수가 빠지면 인정하지 않음',()=>{
  const p=inline(),inc=body(p).splice(1,1)[0];body(p)[1].statements![0].splice(2,0,inc);body(p)[1].statements![1].unshift(structuredClone(inc));
  const g=gradeProject(p);expect(g.criteria[9].deduction).toBe(0);expect(g.criteria[10].deduction).toBe(1);
 });
});
