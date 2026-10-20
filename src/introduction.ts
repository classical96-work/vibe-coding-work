/** Deterministic recognition of a number-guessing introduction, independent of the random range. */
export function introductionMeaning(message: string): 'accept'|'review'|'reject' {
  const raw=message.normalize('NFKC');
  const s=raw.replace(/\s/g,'');
  const numeric=/숫자|정수|자연수|number/i.test(s)
    || /(?:생각한|고른|골라둔|정한|선택한|어떤|무슨|그|이)수(?:를|가|는|중|인지|일|맞|하나|뭐)/.test(s)
    || /(?:^|[\s.,!?])수\s*(?:를|가|는|중|인지|일|하나|맞)/.test(raw)
    || /\d.*(?:사이|부터|까지|~).*수/.test(s);
  // Keep invitations distinct from words such as 맞춤법 and from "맞추지 마세요".
  const invitation=/(?<!안|못)(?:맞[혀춰쳐처]|마[춰쳐처])(?!(?:보)?(?:지(?:마|말|않)|면안))(?:봐|보|볼|줘|주|라|렴|요|[.!?~]|$)/.test(s)
    || /(?<!안|못)(?:맞추|맞히|마추)(?!(?:어)?(?:보)?(?:지(?:마|말|않)|면안))(?:세요|어(?:봐|보|볼|주)|자|렴|기(?:게임|놀이)|는(?:게임|놀이))/.test(s);
  const guessing=invitation || /(?:추측|추리|예측|예상)(?:해|하)|알아내(?:봐|보|볼|주)|찾아내(?:봐|보|볼|주)/.test(s);
  const question=/뭐게|뭘까|뭔지|무엇일까|몇일까|얼마일까/.test(s);
  if(numeric&&(guessing||question))return 'accept';
  if(!numeric&&/이름|색깔|동물|나라|직업|노래|인물|과일|단어|맞춤법/.test(s))return 'reject';
  return guessing||question?'review':'reject';
}
