const {app,BrowserWindow}=require('electron');
app.commandLine.appendSwitch('remote-debugging-port','19192');
app.whenReady().then(()=>{const w=new BrowserWindow({width:1920,height:1080,show:true,webPreferences:{backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});w.loadURL('http://127.0.0.1:4321/login/');});

