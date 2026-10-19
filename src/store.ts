import type { Criterion, Grade, Notebook, ScoreRow, Submission } from './types';
import { recalculate } from './grader';
export const STORE_KEY = 'entry-grading-notebook.v1';
export interface ScoreStore { load(): Notebook | undefined; save(data: Notebook): void }
export const defaultNotebook = (): Notebook => ({version:1,settings:{base:10,rows:33,gradeLevel:2},classes:{},revision:0,backedUpRevision:0});
export class BrowserScoreStore implements ScoreStore {
  load() { const json = localStorage.getItem(STORE_KEY); return json ? validateNotebook(JSON.parse(json)) : undefined; }
  save(data: Notebook) { localStorage.setItem(STORE_KEY,JSON.stringify(data)); }
}
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, low: number, high: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
const string = (v: unknown, limit = 10000): v is string => typeof v === 'string' && v.length <= limit;
function bad(): never { throw new Error('채점노트 백업 형식이 올바르지 않습니다. 기존 데이터는 변경하지 않았습니다.'); }
function validateGrade(v: any): Grade {
  if (!record(v) || !Array.isArray(v.criteria) || v.criteria.length !== 13 || !finite(v.base,0,100) || !Array.isArray(v.naming) || !v.naming.every((s: unknown) => string(s)) || !Array.isArray(v.notices) || !v.notices.every((s: unknown) => string(s))) bad();
  const criteria: Criterion[] = v.criteria.map((c: any,i: number) => {
    const max = [4,9].includes(i) ? 2 : 1;
    if (!record(c) || c.id !== i+1 || c.max !== max || !finite(c.deduction,0,max) || !string(c.label) || !string(c.reason) || (c.review !== undefined && !string(c.review)) || (c.decision !== undefined && !['accept','deduct'].includes(c.decision))) bad();
    return {id:i+1,label:c.label,max,deduction:c.deduction,reason:c.reason,review:c.review,decision:c.decision};
  });
  return recalculate({criteria,naming:[...v.naming],notices:[...v.notices],acknowledged:v.acknowledged === true,base:v.base,performance:0,total:0,reasons:''});
}
export function validateSubmission(v: unknown): Submission {
  if (!record(v) || !string(v.key,200) || !string(v.fileName,1000) || !string(v.pseudocode,300000) || !string(v.received,100)) bad();
  let student;
  if (v.student !== undefined) {
    const s = v.student;
    if (!record(s) || !string(s.id,5) || !/^[1-3]0[1-9](0[1-9]|[1-9]\d)$/.test(s.id) || !Number.isInteger(s.number) || !finite(s.number,1,99) || !Number.isInteger(s.classNo) || !finite(s.classNo,1,9) || !finite(s.grade,1,3) || s.id !== `${s.grade}${String(s.classNo).padStart(2,'0')}${String(s.number).padStart(2,'0')}` || !string(s.name,100)) bad();
    student = {id:s.id,grade:s.grade,classNo:s.classNo,number:s.number,name:s.name};
  }
  return {key:v.key,fileName:v.fileName,pseudocode:v.pseudocode,received:v.received,student,grade:validateGrade(v.grade),demo:v.demo === true};
}
export function validateNotebook(v: unknown): Notebook {
  if (!record(v) || v.version !== 1 || !record(v.settings) || !finite(v.settings.base,0,100) || !Number.isInteger(v.settings.rows) || !finite(v.settings.rows,1,99) || !Number.isInteger(v.settings.gradeLevel) || !finite(v.settings.gradeLevel,1,3) || !record(v.classes) || !finite(v.revision,0,Number.MAX_SAFE_INTEGER) || !finite(v.backedUpRevision,0,Number.MAX_SAFE_INTEGER)) bad();
  const classes: Notebook['classes'] = {};
  for (const [key,rows] of Object.entries(v.classes)) {
    if (!/^[1-9]$/.test(key) || !record(rows)) bad();
    const cleanRows: Record<string,ScoreRow> = {};
    for (const [num,row] of Object.entries(rows)) {
      if (!/^[1-9]\d?$/.test(num) || Number(num) > v.settings.rows || !record(row) || !string(row.name,100) || (row.performance !== undefined && !finite(row.performance,0,15)) || (row.base !== undefined && !finite(row.base,0,100)) || (row.reasons !== undefined && !string(row.reasons))) bad();
      const submission = row.submission === undefined ? undefined : validateSubmission(row.submission);
      if (submission && (!submission.student || submission.student.classNo !== +key || submission.student.number !== +num || submission.student.grade !== v.settings.gradeLevel)) bad();
      cleanRows[num] = {name:row.name,performance:row.performance,base:row.base,reasons:row.reasons,submission};
    }
    classes[key] = cleanRows;
  }
  return {version:1,settings:{base:v.settings.base,rows:v.settings.rows,gradeLevel:v.settings.gradeLevel},classes,revision:v.revision,backedUpRevision:v.backedUpRevision};
}
