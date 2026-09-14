import {languageOf,translateText} from '../../shared/localization';
import type {Lang} from '../../shared/types';
let installed=false,language:Lang='ro';
const originals=new WeakMap<Node,{source:string;rendered:string}>();
const attributes=new WeakMap<Element,Map<string,{source:string;rendered:string}>>();
const ignore='script,style,code,pre,textarea,[data-no-translate]';
function localize(node:Node){
  if(node.nodeType===Node.TEXT_NODE){
    if(!node.parentElement||node.parentElement.closest(ignore))return;
    // Without an explicit value, an option's submitted value follows its display text.
    if(node.parentElement instanceof HTMLOptionElement&&!node.parentElement.hasAttribute('value'))node.parentElement.value=node.parentElement.value;
    const current=node.nodeValue??'',old=originals.get(node),source=old&&current===old.rendered?old.source:current;
    const rendered=translateText(source,language);originals.set(node,{source,rendered});if(current!==rendered)node.nodeValue=rendered;return;
  }
  if(node instanceof Element){
    if(node.matches(ignore))return;
    let saved=attributes.get(node);if(!saved){saved=new Map();attributes.set(node,saved);}
    for(const name of ['aria-label','title','placeholder','alt']){
      const value=node.getAttribute(name);if(value===null)continue;const previous=saved.get(name),source=previous&&value===previous.rendered?previous.source:value;
      const rendered=translateText(source,language);saved.set(name,{source,rendered});if(rendered!==value)node.setAttribute(name,rendered);
    }
  }
  for(const child of node.childNodes)localize(child);
}
export function setUiLanguage(value:unknown){const next=languageOf(value);if(next===language&&installed)return;language=next;document.documentElement.lang=next;if(installed){localize(document.body);const title=document.querySelector('title');if(title)localize(title);}window.dispatchEvent(new Event('nava:language'));}
/** Reconciles display nodes only; leaves controls, focus, event handlers and game values intact. */
export function startUiLocalization(poll=true){
  if(!document.body){document.addEventListener('DOMContentLoaded',()=>startUiLocalization(poll),{once:true});return;}
  if(installed)return;installed=true;language=languageOf(document.documentElement.lang);localize(document.body);
  const confirm=window.confirm.bind(window),alert=window.alert.bind(window),prompt=window.prompt.bind(window);
  window.confirm=message=>confirm(translateText(String(message??''),language));
  window.alert=message=>alert(translateText(String(message??''),language));
  window.prompt=(message,value)=>prompt(translateText(String(message??''),language),value);
  const observer=new MutationObserver(records=>{
    const roots=new Set<Node>();for(const r of records){if(r.type==='childList')for(const n of r.addedNodes)roots.add(n);else roots.add(r.target);}
    for(const node of roots)if(node.isConnected)localize(node);
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});
  if(poll&&location.protocol!=='file:'){
    let busy=false;const refresh=async()=>{if(busy||document.hidden)return;busy=true;try{const r=await fetch('/api/locale',{cache:'no-store'});if(r.ok)setUiLanguage((await r.json()).lang);}catch{}finally{busy=false;}};
    const visible=()=>{if(!document.hidden)void refresh();};
    document.addEventListener('visibilitychange',visible);
    void refresh();const timer=setInterval(()=>void refresh(),10000);window.addEventListener('pagehide',()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);observer.disconnect();},{once:true});
  }
}

/** Bind only this canvas, including measurement, so exported artwork uses the selected language. */
export function localizeCanvas(ctx:CanvasRenderingContext2D,value:unknown=language){
  const lang=languageOf(value),fill=ctx.fillText.bind(ctx),measure=ctx.measureText.bind(ctx);
  ctx.fillText=(text,x,y,maxWidth)=>{const translated=translateText(text,lang);if(maxWidth===undefined)fill(translated,x,y);else fill(translated,x,y,maxWidth);};
  ctx.measureText=text=>measure(translateText(text,lang));
}
