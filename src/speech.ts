/** Ignore presentation and familiar spelling slips when grading spoken text.
 * Numeric range separators remain available to the introduction criterion.
 */
export function normalizeSpeech(message: string): string {
  return message.normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g,'')
    .replace(/[\p{P}\p{S}]/gu,(mark,offset,source:string)=>
      /[~∼〜–-]/.test(mark)||(mark==='.'&&/\d/.test(source[offset-1]??'')&&/\d/.test(source[offset+1]??''))?mark:'')
    .replace(/숫[짜쟈]/g,'숫자')
    .replace(/정\s*[닶덥]/g,'정답')
    .replace(/[맟맛](?=[추춰췄췃혀히쳐처춤])/g,'맞')
    .replace(/(맞|마)[췄췃](?=\s*(?:봐|보|볼))/g,'$1춰');
}
