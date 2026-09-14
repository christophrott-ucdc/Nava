import en from './locales/en.json';
import fr from './locales/fr.json';
import type {Lang} from './types';

export const LANGUAGES:readonly Lang[]=['ro','en','fr'];
export const languageOf=(value:unknown):Lang=>LANGUAGES.includes(value as Lang)?value as Lang:'ro';
export const LOCALE:Record<Lang,string>={ro:'ro-RO',en:'en-GB',fr:'fr-FR'};
const catalogs:Record<'en'|'fr',Record<string,string>>={en,fr};
const clean=(text:string)=>text.replace(/\s+/g,' ').trim();
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const cache=new Map<string,string>();
const templates=new Map<string,Array<{source:RegExp;target:string;slots:string[]}>>();
function patterns(lang:'en'|'fr'){
  if(!templates.has(lang))templates.set(lang,Object.entries(catalogs[lang]).filter(([s])=>/\{\d+\}/.test(s)&&s.replace(/\{\d+\}/g,'').replace(/[^\p{L}]/gu,'').length>=4).sort((a,b)=>b[0].length-a[0].length).map(([source,target])=>{
    const slots=[...source.matchAll(/\{(\d+)\}/g)].map(m=>m[1]);
    return {source:new RegExp('^'+source.split(/\{\d+\}/).map(escape).join('(.{0,300}?)')+'$','iu'),target,slots};
  }));
  return templates.get(lang)!;
}
/** Presentation only. Never apply this to action values, IDs, persisted choices or protocol messages. */
export function translateText(text:string,language:Lang,depth=0):string{
  if(language==='ro'||!text||depth>3)return text;
  const key=clean(text),cacheKey=language+'\0'+key;
  const known=cache.get(cacheKey);if(known!==undefined)return text.replace(text.trim(),known);
  const dictionary=catalogs[language];let translated=dictionary[key];
  if(translated===undefined){
    const capitalized=key.charAt(0).toLocaleUpperCase('ro')+key.slice(1);
    if(capitalized!==key&&dictionary[capitalized])translated=dictionary[capitalized].charAt(0).toLocaleLowerCase(language)+dictionary[capitalized].slice(1);
    const sentence=key.charAt(0).toLocaleUpperCase('ro')+key.slice(1).toLocaleLowerCase('ro');
    if(key===key.toLocaleUpperCase('ro')&&dictionary[sentence])translated=dictionary[sentence].toLocaleUpperCase(language);
  }
  if(translated===undefined&&key.length<=1800)for(const pattern of patterns(language)){
    const match=pattern.source.exec(key);if(!match)continue;
    const values=new Map(pattern.slots.map((slot,i)=>[slot,translateText(match[i+1],language,depth+1)]));
    translated=pattern.target.replace(/\{(\d+)\}/g,(_,slot)=>values.get(slot)??'{'+slot+'}');
    if(key===key.toLocaleUpperCase('ro'))translated=translated.toLocaleUpperCase(language);break;
  }
  if(translated===undefined){
    const parts=key.split(/(\s*·\s*|\n|\s*→\s*|;\s*)/);
    if(parts.length>1){
      const output:string[]=[];
      for(let i=0;i<parts.length;i++){
        if(i%2){output.push(parts[i]);continue;}
        let matched=false,end=Math.min(parts.length-1,i+10);if(end%2)end--;
        for(;end>i;end-=2){const joined=clean(parts.slice(i,end+1).join(''));if(dictionary[joined]!==undefined){output.push(dictionary[joined]);i=end;matched=true;break;}}
        if(!matched)output.push(translateText(parts[i],language,depth+1));
      }
      translated=output.join('');
    }
  }
  translated??=key;
  if(cache.size>12000)cache.clear();cache.set(cacheKey,translated);
  return text.replace(text.trim(),translated);
}
export function uiText(text:string):string{return translateText(text,typeof document==='undefined'?'ro':languageOf(document.documentElement.lang));}
