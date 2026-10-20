import type { Block, Criterion, Grade, Project, Variable } from './types';
import { expressionBlocks, isBlock, literal, walk } from './parser';
const labels = ['시작 버튼으로 게임 시작','정답 변수 숨기기','1~10 난수를 정답에 저장','정답횟수 0으로 초기화','숫자맞추기 시작 안내','반복 안에서 숫자 입력','정답일 때 정답 안내','입력이 작을 때 큰 수 안내','입력이 클 때 작은 수 안내','모든 입력의 횟수 +1','종료 후 시도 횟수 안내','오답이면 계속 반복','정답이면 반복 종료'];
export const numerals = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬'];
const compact = (s: string) => s.replace(/\s/g, '');
const params = (b: Block) => b.params ?? [];
const ref = (v: unknown): string | undefined => isBlock(v) && v.type === 'get_variable' ? String(v.params?.[0]) : undefined;
const speak = (b: Block) => ['dialog_time','dialog'].includes(b.type) && !params(b).includes('think');
const says = (bs: Block[]) => bs.filter(speak).map(b => literal(params(b)[0]));
const contains = (b: Block, t: string) => expressionBlocks(params(b)[0]).some(e => e.type === t);
interface Trace { events: Block[]; stopped: boolean; uncertain: boolean }
function comparison(v: unknown) {
  if (!isBlock(v) || v.type !== 'boolean_basic_operator') return undefined;
  const p = params(v);
  if (!['EQUAL','GREATER','LESS'].includes(String(p[1]))) return undefined;
  return { left: p[0], op: String(p[1]), right: p[2] };
}
function paths(blocks: Block[], relation: -1 | 0 | 1, secretId?: string): Trace[] {
  let traces: Trace[] = [{ events: [], stopped: false, uncertain: false }];
  for (const b of blocks) {
    const next: Trace[] = [];
    for (const t of traces) {
      if (t.stopped) { next.push(t); continue; }
      const events = [...t.events, b];
      if (b.type === 'stop_repeat') { next.push({ ...t, events, stopped: true }); continue; }
      if (['if_else','_if'].includes(b.type)) {
        const c = comparison(params(b)[0]);
        let truth: boolean | undefined;
        if (c) {
          const leftAnswer = isBlock(c.left) && c.left.type === 'get_canvas_input_value';
          const rightAnswer = isBlock(c.right) && c.right.type === 'get_canvas_input_value';
          // Invalid variable references are penalized by their comparison criteria. Trace the intended control shape separately.
          if ((leftAnswer && ref(c.right)) || (rightAnswer && ref(c.left))) {
            const order = leftAnswer ? relation : -relation;
            truth = c.op === 'EQUAL' ? order === 0 : c.op === 'GREATER' ? order > 0 : order < 0;
          }
        }
        const branches = truth === undefined ? [0, 1] : [truth ? 0 : 1];
        for (const i of branches) {
          for (const sub of paths(b.statements?.[i] ?? [], relation, secretId)) next.push({ events: [...events, ...sub.events], stopped: sub.stopped, uncertain: t.uncertain || sub.uncertain || truth === undefined });
        }
      } else next.push({ ...t, events });
    }
    if (next.length > 64) throw new Error('조건 분기가 너무 많아 자동 채점할 수 없습니다. 교사가 직접 확인해 주세요.');
    traces = next;
  }
  return traces;
}
export function recalculate(grade: Grade): Grade {
  const namingPenalty = grade.naming.length ? 1 : 0;
  const deductions = grade.criteria.reduce((n, c) => n + (c.decision === 'accept' ? 0 : c.decision === 'deduct' ? c.max : c.deduction), 0);
  const performance = Math.max(0, 15 - namingPenalty - deductions);
  const reasons = [...grade.naming, ...grade.criteria.filter(c => c.decision === 'deduct' || (c.decision !== 'accept' && c.deduction > 0)).map(c => `${numerals[c.id - 1]} ${c.reason}${c.decision === 'deduct' && c.deduction === 0 ? ' (교사 감점)' : ''}`)];
  return { ...grade, performance, total: performance + grade.base, reasons: reasons.join('\n') || 'Perfect' };
}
export function pendingCount(grade: Grade): number { return grade.criteria.filter(c => c.review && !c.decision).length + (!grade.acknowledged ? grade.notices.length : 0); }
export function gradeProject(project: Project, base = 10): Grade {
  const criteria: Criterion[] = labels.map((label, i) => ({ id: i + 1, label, max: [4,9].includes(i) ? 2 : 1, deduction: 0, reason: label }));
  const fail = (id: number, reason: string, amount?: number) => { const c = criteria[id - 1]; c.deduction = amount ?? c.max; c.reason = reason; };
  const review = (id: number, message: string) => { criteria[id - 1].review = message; criteria[id - 1].deduction = 0; criteria[id - 1].reason = message; };
  const notices: string[] = [];
  const variables = project.variables.filter(v => !['timer','answer'].includes(v.variableType ?? ''));
  const byId = new Map(variables.map(v => [v.id, v]));
  const starts = project.objects.flatMap(o => o.script.filter(t => t[0]?.type === 'when_run_button_click').map(thread => ({ object: o.name, thread })));
  const all = starts.flatMap(t => walk(t.thread));
  const gameThreads = starts.filter(t => walk(t.thread).some(b => ['repeat_inf','ask_and_wait'].includes(b.type)));
  if (gameThreads.length > 1) notices.push('게임 로직이 여러 시작 스레드에 있습니다. 동시 실행·중복 프로그램 여부를 확인해 주세요.');
  const main = gameThreads[0]?.thread ?? starts[0]?.thread ?? [];
  const loops = walk(main).filter(b => b.type === 'repeat_inf');
  if (loops.length > 1) notices.push('반복문이 여러 개입니다. 첫 게임 반복문을 기준으로 채점했습니다. 전체 흐름을 확인해 주세요.');
  const loop = loops[0];
  const loopIndex = main.indexOf(loop);
  const before = loopIndex >= 0 ? main.slice(0, loopIndex) : main;
  const after = loopIndex >= 0 ? main.slice(loopIndex + 1) : [];
  const body = loop?.statements?.[0] ?? [];
  const findVar = (name: string) => variables.find(v => compact(v.name) === name);
  let secret = findVar('정답');
  let counter = findVar('정답횟수');
  // A unique structural alias avoids charging every criterion for one naming mistake.
  const infer = (ids: string[], exclude?: Variable) => {
    const found = [...new Set(ids)].map(id => byId.get(id)).filter((v): v is Variable => !!v && v.id !== exclude?.id);
    return found.length === 1 ? found[0] : undefined;
  };
  if (!secret) secret = infer(all.filter(b => b.type === 'set_variable' && isBlock(params(b)[1]) && (params(b)[1] as Block).type === 'calc_rand').map(b => String(params(b)[0])), counter);
  if (!counter) counter = infer(walk(body).filter(b => b.type === 'change_variable').map(b => String(params(b)[0])), secret);
  if (!counter) counter = infer(after.filter(speak).flatMap(b => expressionBlocks(params(b)[0]).filter(e => e.type === 'get_variable').map(e => String(params(e)[0]))), secret);
  const naming: string[] = [];
  if (!findVar('정답')) naming.push(`필수 변수명 '정답' 미사용${secret ? `(${secret.name})` : ''}`);
  if (!findVar('정답횟수')) naming.push(`필수 변수명 '정답횟수' 미사용${counter ? `(${counter.name})` : ''}`);
  for (const name of ['정답','정답횟수']) if (variables.filter(v => compact(v.name) === name).length > 1) notices.push(`'${name}' 이름의 변수가 여러 개입니다. 변수 ID별 참조를 확인해 주세요.`);
  const isVar = (b: Block, variable?: Variable) => !!variable && params(b)[0] === variable.id;
  if (!main.length || !walk(main).some(b => ['repeat_inf','ask_and_wait','set_variable'].includes(b.type))) fail(1,'시작 버튼으로 실행되는 게임 로직 없음');
  if (!secret || !(secret.visible === false || all.some(b => b.type === 'hide_variable' && isVar(b, secret)))) fail(2,'정답 변수가 보이거나 숨기기 대상이 잘못됨');
  if (secret && all.some(b => b.type === 'show_variable' && isVar(b, secret))) review(2,'정답을 표시하는 블록도 있습니다. 실행 시 노출되는지 확인해 주세요.');
  const secretSets = before.filter(b => b.type === 'set_variable' && isVar(b, secret));
  const lastSecret = secretSets.at(-1);
  if (!lastSecret || !isBlock(params(lastSecret)[1]) || (params(lastSecret)[1] as Block).type !== 'calc_rand') fail(3,'난수를 정답 변수에 저장하지 않음');
  else {
    // Entry calc_rand uses params[1] and params[3] for the lower and upper bounds.
    const random = params(lastSecret)[1] as Block;
    const lower = params(random)[1], upper = params(random)[3];
    const dynamic = (v: unknown) => isBlock(v) && !['number','text'].includes(v.type);
    const number = (v: unknown): number => {
      const value = isBlock(v) ? params(v)[0] : v;
      return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' ? Number(value) : NaN;
    };
    if (dynamic(lower) || dynamic(upper)) review(3,'정답 난수 범위가 1~10인지 자동 확인할 수 없습니다. 다른 범위이면 1점 감점해 주세요.');
    else if (number(lower) !== 1 || number(upper) !== 10) fail(3,`정답 난수 범위가 1~10이 아님(설정값 ${literal(lower) || '없음'}~${literal(upper) || '없음'})`);
  }
  const resets = before.filter(b => b.type === 'set_variable' && isVar(b, counter));
  const initial = resets.at(-1);
  const initialValue = initial ? literal(params(initial)[1]) : counter?.value;
  if (!counter || (initial && isBlock(params(initial)[1]) && !['text','number'].includes((params(initial)[1] as Block).type)) || String(initialValue).trim() === '' || Number(initialValue) !== 0) fail(4,`정답횟수 초기값 0 설정 없음(저장값 ${String(initialValue ?? '없음')})`);
  if (walk(body).some(b => b.type === 'set_variable' && isVar(b, counter))) fail(4,'반복 안에서 정답횟수를 다시 설정함');
  const intros = says(before).map(compact);
  const isGame = (s: string) => /맞|추측/.test(s);
  if (!intros.some(s => isGame(s) && /숫자|수를|수가|수는|생각한수|수맞/.test(s))) {
    if (intros.some(isGame)) review(5,'시작 안내가 게임 설명인지 확인해 주세요. 불인정하면 2점 감점입니다.');
    else fail(5,'숫자맞추기 시작 안내 없음');
  }
  const validComparison = (v: unknown) => {
    const c = comparison(v);
    if (!c || !secret) return false;
    return (ref(c.left) === secret.id && isBlock(c.right) && c.right.type === 'get_canvas_input_value') || (ref(c.right) === secret.id && isBlock(c.left) && c.left.type === 'get_canvas_input_value');
  };
  const eqBlocks = walk(body).filter(b => ['if_else','_if'].includes(b.type) && comparison(params(b)[0])?.op === 'EQUAL');
  const hasEq = eqBlocks.some(b => validComparison(params(b)[0]));
  const directionBlocks = walk(body).filter(b => ['if_else','_if'].includes(b.type) && ['GREATER','LESS'].includes(comparison(params(b)[0])?.op ?? ''));
  const goodDirections = directionBlocks.length > 0 && directionBlocks.every(b => validComparison(params(b)[0]));
  const wrongLow = paths(body, -1, secret?.id), correct = paths(body, 0, secret?.id), wrongHigh = paths(body, 1, secret?.id);
  const allPaths = [...wrongLow, ...correct, ...wrongHigh];
  if (!loop || !allPaths.every(p => p.events.some(b => b.type === 'ask_and_wait'))) fail(6,'반복 안에 숫자 입력(묻고 기다리기) 없음');
  const correctSpeech = new Set(eqBlocks.filter(b => validComparison(params(b)[0])).flatMap(b => walk(b.statements?.[0] ?? []).filter(speak)));
  if (!hasEq || !correct.every(p => says(p.events.filter(b => correctSpeech.has(b))).some(s => /정답/.test(s) && !/아니|아닙|오답|틀렸/.test(s)))) fail(7,'정답 분기의 정답 안내 또는 유효한 정답 비교 없음');
  const direction = (s: string): -1 | 0 | 1 | undefined => {
    const text = compact(s);
    if (/^(큼|작음)[.!~]*$/.test(text) || /않|아니|아닙|말고/.test(text)) return 0;
    const big = /큽|크|커|큰|높/.test(text), small = /작|낮/.test(text);
    if (big === small) return undefined;
    const d = big ? 1 : -1;
    return !/^정답/.test(text) && /^(입력|너의|네가|대답)/.test(text) && !/보다정답/.test(text) ? -d as -1 | 1 : d;
  };
  const hintSpeeches = new Set(directionBlocks.flatMap(b => walk((b.statements ?? []).flat()).filter(speak)));
  const hints = (p: Trace) => says(p.events.filter(b => hintSpeeches.has(b))).map(direction);
  for (const [id, traces, desired] of [[8,wrongLow,1],[9,wrongHigh,-1]] as const) {
    if (!goodDirections || !traces.every(p => hints(p).includes(desired) && !hints(p).includes(-desired as -1 | 1))) {
      if (goodDirections && traces.every(p => hints(p).some(d => d === desired || d === 0) && !hints(p).includes(-desired as -1 | 1))) review(id,'큼/작음 안내의 주어가 모호합니다. 방향이 맞는지 확인해 주세요.');
      else fail(id,goodDirections ? '크다/작다 안내가 없거나 방향이 잘못됨' : '크기 비교 대상이 정답과 대답이 아님');
    }
  }
  const inputCount = (p: Trace) => {
    let sum = 0, asks = 0, beforeAsk = false;
    for (const b of p.events) {
      if (b.type === 'ask_and_wait') asks++;
      if (b.type === 'change_variable' && isVar(b, counter)) { if (!asks) beforeAsk = true; sum += Number(literal(params(b)[1])); }
    }
    return asks === 1 && sum === 1 && !beforeAsk;
  };
  if (!allPaths.every(inputCount)) {
    if (wrongLow.every(inputCount) && wrongHigh.every(inputCount) && !correct.every(inputCount)) fail(10,'마지막 정답 입력을 횟수에 포함하지 않음',1);
    else fail(10,'입력마다 정답횟수를 정확히 1 증가시키지 않음');
  }
  if (!after.some(b => speak(b) && contains(b,'combine_something') && expressionBlocks(params(b)[0]).some(e => e.type === 'get_variable' && isVar(e,counter)) && /번|회/.test(literal(params(b)[0])))) fail(11,'반복 종료 뒤 횟수를 합쳐 말하는 안내 없음');
  if (!loop || ![...wrongLow,...wrongHigh].every(p => !p.stopped)) fail(12,'오답에서 반복이 종료되거나 반복문 없음');
  if (!loop || !correct.every(p => p.stopped)) fail(13,'정답 분기에 반복 종료 없음');
  if (allPaths.some(p => p.uncertain)) {
    for (const id of [6,7,8,9,10,12,13]) review(id,'지원하지 않는 조건식이 포함되어 실행 경로를 확정할 수 없습니다. 직접 확인해 주세요.');
  }
  const supported = new Set(['when_run_button_click','hide_variable','show_variable','set_variable','change_variable','dialog_time','dialog','repeat_inf','ask_and_wait','if_else','_if','stop_repeat','set_visible_answer']);
  const unknown = [...new Set(all.filter(b => !supported.has(b.type)).map(b => b.type))];
  if (unknown.length) {
    notices.push(`자동 분석 범위 밖의 블록: ${unknown.join(', ').slice(0,1000)}. 실행 흐름에 미치는 영향을 확인해 주세요.`);
    for (const c of criteria) if (!c.review) review(c.id,'지원 범위 밖의 블록이 있어 자동 확정할 수 없습니다. 의사코드를 확인해 주세요.');
  }
  if (loop && loopIndex < 0) {
    notices.push('게임 반복문이 조건문 안에 있습니다. 시작 시 실제 실행되는지 확인해 주세요.');
    for (const id of [3,4,5,11]) review(id,'반복문이 중첩되어 시작·종료 순서의 수동 확인이 필요합니다.');
  }
  return recalculate({criteria,naming,notices,performance:15,base,total:15+base,reasons:''});
}
