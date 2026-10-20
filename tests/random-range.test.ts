import {describe,it,expect} from 'vitest';
import {b,demoProject,text,v} from '../src/demo';
import {gradeProject,pendingCount} from '../src/grader';
import {parseEnt} from '../src/parser';
import {archiveProject} from './archive';
import type {Block,Project} from '../src/types';
function random(p:Project):Block{return p.objects[0].script[0][2].params![1] as Block;}
describe('정답 난수는 1~10으로 설정',()=>{
 it.each([[1,100],[0,10],[1,9],[2,10],[1,1000000000],[10,1],[1.1,10]])('%s~%s는 ③에서만 1점 감점',(lower,upper)=>{
  const p=demoProject();random(p).params![1]=text(lower);random(p).params![3]=text(upper);
  const g=gradeProject(p);
  expect(g.performance).toBe(14);expect(g.total).toBe(24);expect(g.criteria.filter(c=>c.deduction>0).map(c=>c.id)).toEqual([3]);
  expect(g.reasons).toBe(`③ 정답 난수 범위가 1~10이 아님(설정값 ${lower}~${upper})`);expect(pendingCount(g)).toBe(0);
 });
 it.each([[text('1'),text('10')],[b('number',['1']),b('number',['10'])],[1,10],[' 1.0 ','10.0']])('숫자로 1과 10인 상수는 인정',(lower,upper)=>{
  const p=demoProject();random(p).params![1]=lower;random(p).params![3]=upper;
  expect(gradeProject(p).reasons).toBe('Perfect');
 });
 it.each([[null,text(10)],[text(1),undefined],[text(''),text(10)],[text(1),text('열')]])('범위 누락·비숫자는 감점',(lower,upper)=>{
  const p=demoProject();random(p).params![1]=lower;random(p).params![3]=upper;
  expect(gradeProject(p).performance).toBe(14);expect(gradeProject(p).criteria[2].deduction).toBe(1);
 });
 it('변수로 지정한 범위를 문자열로 이어붙여 인정하지 않음',()=>{
  const p=demoProject();random(p).params![3]=v('count');
  const g=gradeProject(p);expect(g.criteria[2].review).toContain('1~10');expect(pendingCount(g)).toBe(1);
 });
 it('고정값 설정은 난수 항목 한 번만 감점',()=>{
  const p=demoProject();p.objects[0].script[0][2].params![1]=text(5);
  expect(gradeProject(p).performance).toBe(14);
 });
 it('마지막으로 정답에 저장하는 난수의 범위를 판정',()=>{
  const p=demoProject();p.objects[0].script[0].splice(3,0,b('set_variable',['secret',b('calc_rand',[null,text(1),null,text(100),null])]));
  expect(gradeProject(p).performance).toBe(14);
 });
 it('실제 압축 아카이브 분석 후에도 범위 감점 적용',()=>{
  const p=demoProject();random(p).params![3]=text(100);
  expect(gradeProject(parseEnt(archiveProject(p))).performance).toBe(14);
 });
});
