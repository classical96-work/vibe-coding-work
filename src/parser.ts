import { Gunzip } from 'fflate';
import type { Block, Project, Student } from './types';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED = 80 * 1024 * 1024;
function fail(message: string): never { throw new Error(message); }
export function normalizeProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') fail('프로젝트 JSON 형식이 올바르지 않습니다.');
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.objects) || !Array.isArray(obj.variables)) fail('엔트리 프로젝트의 오브젝트 또는 변수 목록이 없습니다.');
  if (obj.objects.length > 500 || obj.variables.length > 5000) fail('프로젝트가 너무 큽니다.');
  let blocks = 0;
  const check = (v: unknown, depth = 0): void => {
    if (depth > 100 || ++blocks > 150000) fail('블록 구조가 너무 복잡합니다.');
    if (Array.isArray(v)) v.forEach(x => check(x, depth + 1));
    else if (v && typeof v === 'object') Object.values(v).forEach(x => check(x, depth + 1));
  };
  const variables = obj.variables.map((v: any) => {
    if (!v || typeof v.id !== 'string' || typeof v.name !== 'string' || v.name.length > 1000) fail('변수 형식이 올바르지 않습니다.');
    return { id: v.id, name: v.name, value: v.value, visible: v.visible, variableType: v.variableType };
  });
  if (new Set(variables.map(v => v.id)).size !== variables.length) fail('중복된 변수 ID가 있습니다.');
  const objects = obj.objects.map((o: any) => {
    if (!o || typeof o !== 'object') fail('오브젝트 형식이 올바르지 않습니다.');
    let script: unknown;
    try { script = typeof o.script === 'string' ? JSON.parse(o.script) : o.script; }
    catch { fail('오브젝트의 스크립트 JSON을 읽을 수 없습니다.'); }
    if (!Array.isArray(script) || script.some(t => !Array.isArray(t))) fail('블록 스레드 형식이 올바르지 않습니다.');
    check(script);
    const validate = (xs: unknown[]): void => xs.forEach((b: any) => {
      if (!b || typeof b.type !== 'string' || b.type.length > 100 || (b.params !== undefined && !Array.isArray(b.params)) || (b.statements !== undefined && (!Array.isArray(b.statements) || b.statements.some((s: unknown) => !Array.isArray(s))))) fail('블록 형식이 올바르지 않습니다.');
      (b.statements ?? []).forEach(validate);
    });
    (script as unknown[][]).forEach(validate);
    return { name: typeof o.name === 'string' ? o.name : '이름 없는 오브젝트', script: script as Block[][] };
  });
  return { variables, objects };
}
export function parseEnt(bytes: Uint8Array): Project {
  if (bytes.length > MAX_FILE_BYTES) fail('파일당 최대 25MB까지 분석할 수 있습니다.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const stream = new Gunzip(chunk => {
      size += chunk.length;
      if (size > MAX_EXPANDED) fail('압축을 푼 파일이 80MB를 초과합니다.');
      chunks.push(chunk);
    });
    for (let i = 0; i < bytes.length; i += 16384) stream.push(bytes.subarray(i, i + 16384), i + 16384 >= bytes.length);
  } catch (e) { throw new Error(e instanceof Error && e.message.includes('80MB') ? e.message : 'gzip 압축을 읽을 수 없습니다. 엔트리에서 저장한 .ent 파일인지 확인해 주세요.'); }
  const tar = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { tar.set(chunk, offset); offset += chunk.length; }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const field = (start: number, len: number) => new TextDecoder().decode(tar.subarray(start, start + len)).replace(/\0.*$/s, '');
  for (let pos = 0; pos + 512 <= tar.length;) {
    if (tar.subarray(pos, pos + 512).every(x => x === 0)) break;
    const name = field(pos, 100), prefix = field(pos + 345, 155);
    const full = `${prefix ? prefix + '/' : ''}${name}`.replace(/^\.\//, '');
    const sizeText = field(pos + 124, 12).trim();
    if (!/^[0-7]+$/.test(sizeText)) fail('tar 항목 크기가 올바르지 않습니다.');
    const fileSize = parseInt(sizeText, 8);
    const checksumText = field(pos + 148, 8).trim();
    let checksum = 0;
    for (let n = 0; n < 512; n++) checksum += n >= 148 && n < 156 ? 32 : tar[pos + n];
    if (!/^[0-7]+$/.test(checksumText) || checksum !== parseInt(checksumText, 8)) fail('tar 헤더가 손상되었습니다.');
    if (!Number.isSafeInteger(fileSize) || pos + 512 + fileSize > tar.length) fail('압축 파일의 내용이 잘렸습니다.');
    if (full === 'temp/project.json' || full === 'project.json') {
      if (fileSize > 8 * 1024 * 1024) fail('프로젝트 JSON이 8MB를 초과합니다.');
      try { return normalizeProject(JSON.parse(decoder.decode(tar.subarray(pos + 512, pos + 512 + fileSize)))); }
      catch (e) { throw new Error(`프로젝트 분석 실패: ${e instanceof Error ? e.message : 'JSON 오류'}`); }
    }
    pos += 512 + Math.ceil(fileSize / 512) * 512;
  }
  return fail('압축 파일 안에서 temp/project.json을 찾지 못했습니다.');
}
export function parseStudent(fileName: string): Student | undefined {
  const match = fileName.match(/(?:^|\D)([1-3])(0[1-9])(0[1-9]|[1-9]\d)(?!\d)/);
  if (!match) return undefined;
  const id = match[1] + match[2] + match[3];
  const tail = fileName.slice((match.index ?? 0) + match[0].length).replace(/\.ent$/i, '');
  return { id, grade: +match[1], classNo: +match[2], number: +match[3], name: tail.match(/[가-힣]+/)?.[0]?.slice(0,100) ?? '' };
}
export function isBlock(v: unknown): v is Block { return !!v && typeof v === 'object' && typeof (v as Block).type === 'string'; }
export function walk(blocks: Block[]): Block[] { return blocks.flatMap(b => [b, ...walk((b.statements ?? []).flat())]); }
export function expressionBlocks(v: unknown): Block[] {
  if (!isBlock(v)) return [];
  return [v, ...(v.params ?? []).flatMap(expressionBlocks)];
}
export function literal(v: unknown): string {
  if (isBlock(v)) return ['text', 'number'].includes(v.type) ? String(v.params?.[0] ?? '') : (v.params ?? []).filter(x => x !== null).map(literal).join('');
  return v === null || v === undefined ? '' : String(v);
}
export function pseudocode(project: Project): string {
  const vars = new Map(project.variables.map(v => [v.id, v.name]));
  const variable = (id: unknown) => vars.get(String(id)) ?? `존재하지 않는 변수(${String(id)})`;
  const expr = (v: unknown): string => {
    if (!isBlock(v)) return v == null ? '' : String(v);
    const p = v.params ?? [];
    if (v.type === 'get_variable') return variable(p[0]);
    if (v.type === 'get_canvas_input_value') return '대답';
    if (['text','number'].includes(v.type)) return JSON.stringify(p[0]);
    return `${v.type}(${p.filter(x => x != null).map(expr).join(', ')})`;
  };
  const lines = (blocks: Block[], depth: number): string[] => blocks.flatMap(b => {
    const p = b.params ?? [];
    const arg = ['set_variable','change_variable','hide_variable','show_variable'].includes(b.type)
      ? [variable(p[0]), ...p.slice(1).filter(x => x != null).map(expr)].join(', ')
      : p.filter(x => x != null).map(expr).join(', ');
    const indent = '  '.repeat(depth);
    return [`${indent}${b.type}(${arg})`, ...(b.statements ?? []).flatMap((s, i) => [`${indent}  branch${i}${b.type === 'if_else' ? i === 0 ? ' · 참' : ' · 거짓' : ''}`, ...lines(s, depth + 2)])];
  });
  return project.objects.map(o => `오브젝트: ${o.name}\n${o.script.map((t, i) => `  스레드 ${i + 1}\n${lines(t, 2).join('\n')}`).join('\n')}`).join('\n\n');
}
