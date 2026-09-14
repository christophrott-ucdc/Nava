import {BrowserWindow} from 'electron';
/** Isolated invisible print renderer; never navigates to a supplied URL. */
export async function renderDiplomaPdf(html:string):Promise<Buffer>{
 const window=new BrowserWindow({show:false,width:1123,height:794,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false,partition:'diploma-print'}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([(async()=>{await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));return window.webContents.printToPDF({landscape:true,pageSize:'A4',printBackground:true,preferCSSPageSize:true,margins:{top:0,bottom:0,left:0,right:0}});})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF timeout')),20000);})]);}
 finally{if(timer)clearTimeout(timer);if(!window.isDestroyed())window.destroy();}
}
