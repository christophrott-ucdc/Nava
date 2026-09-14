import {app} from 'electron';
import {NsisUpdater} from 'electron-updater';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import type {AppUpdatePort,AppUpdateStatus,UpdateFeed} from '../shared/integrations';

/** Explicit admin-controlled NSIS updates. No check/download/install on startup or app quit. */
export class ApplicationUpdates implements AppUpdatePort {
  private updater:NsisUpdater|null=null;private busy=false;
  private current:AppUpdateStatus={state:'disabled',version:app.getVersion(),message:'Configurează o sursă de actualizare.',installSupported:app.isPackaged&&process.platform==='win32'&&!process.env.PORTABLE_EXECUTABLE_FILE&&!process.env.PORTABLE_EXECUTABLE_DIR};
  status(){return {...this.current};}
  async configure(feed:UpdateFeed){
    if(this.busy||this.current.state==='installing')throw Error('Actualizarea este în curs.');
    this.updater?.removeAllListeners();this.updater=null;
    this.current={...this.current,state:'disabled',availableVersion:undefined,percent:undefined,message:'Actualizările sunt dezactivate.'};
    if(feed.provider==='disabled')return;
    if(!this.current.installSupported){this.current.message='Actualizarea aplicației cere instalarea Windows NSIS; nu rulează în development sau portable.';return;}
    const publisher=process.env.NAVA_UPDATE_PUBLISHER?.trim();
    if(!publisher){this.current.message='Lipsește editorul de cod de încredere (NAVA_UPDATE_PUBLISHER). Descărcarea este blocată.';return;}
    const configFile=path.join(app.getPath('userData'),'trusted-update-feed.json');
    await fs.mkdir(path.dirname(configFile),{recursive:true});
    await fs.writeFile(configFile,JSON.stringify({...feed,publisherName:[publisher],updaterCacheDirName:'exodus7-updater'}));
    const updater=new NsisUpdater(feed);updater.updateConfigPath=configFile;
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;updater.disableWebInstaller=true;
    updater.on('error',(error:Error)=>{this.current.state='error';this.current.message=error.message;});
    updater.on('update-available',info=>{this.current.state='available';this.current.availableVersion=info.version;this.current.message='Versiune disponibilă: '+info.version;});
    updater.on('update-not-available',()=>{this.current.state='idle';this.current.availableVersion=undefined;this.current.message='Aplicația este la zi.';});
    updater.on('download-progress',p=>{this.current.percent=p.percent;});
    this.updater=updater;this.current.state='idle';this.current.message='Canal stable configurat. Verificarea se face la cerere.';
  }
  private require(){if(!this.updater)throw Error(this.current.message);if(this.busy)throw Error('O operație de actualizare este deja în curs.');return this.updater;}
  async check(){const u=this.require();this.busy=true;this.current.state='checking';try{
    await u.checkForUpdates();
  }catch(error){this.current.state='error';this.current.message=String(error);throw error;}finally{this.busy=false;}}
  async download(){const u=this.require();if(this.current.state!=='available')throw Error('Verifică mai întâi versiunea disponibilă.');this.busy=true;this.current.state='downloading';try{
    const files=await u.downloadUpdate();if(!files.length)throw Error('Actualizarea nu a fost descărcată.');
    this.current.state='downloaded';this.current.percent=100;this.current.message='Installer verificat. Instalarea cere administrator și backup reușit.';
  }catch(error){this.current.state='error';this.current.message=String(error);throw error;}finally{this.busy=false;}}
  install(){const u=this.require();if(this.current.state!=='downloaded')throw Error('Nu există un installer verificat.');this.current.state='installing';this.current.message='Se închide aplicația și se deschide installerul.';setTimeout(()=>{try{u.quitAndInstall(false,true);}catch(error){this.current.state='error';this.current.message=String(error);}},750);}
}
