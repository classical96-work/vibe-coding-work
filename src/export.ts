import type { Notebook } from './types';
export function download(data: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([data],{type}));
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
const headings = ['번호','이름','수행점수(15)','기본점수','총점','감점사유'];
export function sheetRows(notebook: Notebook, classNo: number): (string | number)[][] {
  const rows = notebook.classes[classNo] ?? {};
  return [headings,...Array.from({length:notebook.settings.rows},(_,i) => {
    const r = rows[i+1];
    return [i+1,r?.name ?? '',r?.performance ?? '',r?.base ?? '',r?.performance === undefined ? '' : r.performance + (r.base ?? 0),r?.reasons ?? ''];
  })];
}
export function csvCell(v: string | number): string {
  let text = String(v);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g,'""') + '"';
}
export async function exportScores(notebook: Notebook, format: 'csv'|'xlsx', scope: 'current'|'all', classNo: number) {
  const classes = scope === 'current' ? [classNo] : [1,2,3,4,5,6,7,8,9];
  const suffix = scope === 'current' ? `${classNo}반` : '전체반';
  if (format === 'csv') {
    const rows = scope === 'current' ? sheetRows(notebook,classNo) : [['반',...headings], ...classes.flatMap(c => sheetRows(notebook,c).slice(1).map(r => [c,...r]))];
    download('\uFEFF'+rows.map(r => r.map(csvCell).join(',')).join('\r\n'),`채점노트_${suffix}.csv`,'text/csv;charset=utf-8');
    return;
  }
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  for (const c of classes) {
    const ws = workbook.addWorksheet(`${c}반`);
    ws.addRows(sheetRows(notebook,c));
    ws.columns = [{width:8},{width:16},{width:18},{width:14},{width:12},{width:65}];
    ws.getRow(1).font = {bold:true,color:{argb:'FFFFFFFF'}};
    ws.getRow(1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF176B50'}};
    ws.getColumn(6).alignment = {wrapText:true,vertical:'top'};
    ws.views = [{state:'frozen',ySplit:1}];
    ws.autoFilter = `A1:F${notebook.settings.rows+1}`;
  }
  const buf = await workbook.xlsx.writeBuffer();
  download(new Uint8Array(buf),`채점노트_${suffix}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
