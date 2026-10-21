import {describe,it,expect} from 'vitest';
import {b,demoProject,say,text} from '../src/demo';
import {gradeProject,pendingCount} from '../src/grader';
import type {Project} from '../src/types';
const body=(p:Project)=>p.objects[0].script[0][4].statements![0];
function incrementFirst(){const p=demoProject(),bs=body(p);[bs[0],bs[1]]=[bs[1],bs[0]];return p;}
describe('⑩ 입력과 횟수 증가 순서보다 실행 경로의 횟수 확인',()=>{
 it('모범답안과 증가→입력 변형 모두 확정 만점',()=>{
  for(const p of [demoProject(),incrementFirst()]){
   const g=gradeProject(p);expect(g.performance).toBe(15);expect(g.criteria[9].deduction).toBe(0);expect(pendingCount(g)).toBe(0);expect(g.reasons).toBe('Perfect');
  }
 });
 it('입력 전에 증가하고 숫자 범위로 시작 안내해도 모두 인정',()=>{
  const p=incrementFirst();p.objects[0].script[0][3]=say('1부터 10까지 입력하세요');
  const g=gradeProject(p);expect(g.reasons).toBe('Perfect');
 });
 it('입력 전에 두 번 증가하면 여전히 2점 감점',()=>{
  const p=incrementFirst();body(p).unshift(b('change_variable',['count',text(1)]));
  expect(gradeProject(p).criteria[9].deduction).toBe(2);
 });
 it('입력 전에 증가량이 2이면 여전히 감점',()=>{
  const p=incrementFirst();body(p)[0].params![1]=text(2);expect(gradeProject(p).criteria[9].deduction).toBe(2);
 });
 it('반복문 밖에서만 한 번 증가하는 경우는 인정하지 않음',()=>{
  const p=incrementFirst(),inc=body(p).shift()!;p.objects[0].script[0].splice(4,0,inc);
  expect(gradeProject(p).criteria[9].deduction).toBe(2);
 });
 it('입력 누락은 증가 순서와 관계없이 감점',()=>{
  const p=incrementFirst();body(p).splice(1,1);const g=gradeProject(p);
  expect(g.criteria[5].deduction).toBe(1);expect(g.criteria[9].deduction).toBe(2);
 });
 it('정답일 때 중단 뒤 증가하여 마지막 입력을 빠뜨리면 1점 감점 유지',()=>{
  const p=incrementFirst(),bs=body(p),inc=bs.shift()!,eq=bs[1];
  eq.statements![0].push(inc);eq.statements![1].unshift(structuredClone(inc));
  const g=gradeProject(p);expect(g.criteria[9].deduction).toBe(1);expect(g.reasons).toContain('마지막 정답 입력');
 });
});
