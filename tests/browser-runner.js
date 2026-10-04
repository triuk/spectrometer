import http from 'node:http';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {once} from 'node:events';
const root=resolve(new URL('..',import.meta.url).pathname);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+pathname);
  if (!path.startsWith(root+'/')) {res.writeHead(403).end();return;}
  try {const body=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream','cache-control':'no-store'}).end(body);}
  catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=await mkdtemp(join(tmpdir(),'spectrometer-browser-'));
const chrome=spawn(process.env.SPECTROMETER_CHROMIUM??'chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let stderr='';const timer=setTimeout(()=>reject(new Error('Chromium startup timeout: '+stderr)),10000);
    chrome.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    chrome.on('exit',(code,signal)=>{clearTimeout(timer);reject(new Error(`Chromium failed (${code}/${signal}): ${stderr}`));});
  });
  socket=new WebSocket(endpoint);await once(socket,'open');
  let id=0;const pending=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(Error(message.error.message)):request.resolve(message.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Page.enable',{},sessionId);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false},sessionId);
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/tests/browser.html${process.env.SPECTROMETER_SCREENSHOT?"?screenshot=1":""}`},sessionId);
  const deadline=Date.now()+45000;let result;
  while(Date.now()<deadline) {
    if(process.env.SPECTROMETER_SCREENSHOT){
      const ready=await send('Runtime.evaluate',{expression:'window.browserScreenshotReady && !window.browserScreenshotDone',returnByValue:true},sessionId);
      if(ready.result.value){
        const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
        await writeFile(process.env.SPECTROMETER_SCREENSHOT,Buffer.from(shot.data,'base64'));
        await send('Runtime.evaluate',{expression:'window.browserScreenshotDone=true'},sessionId);
      }
    }
    const response=await send('Runtime.evaluate',{expression:'window.browserTestResult ?? null',returnByValue:true},sessionId);
    result=response.result.value;if(result)break;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  if(!result)throw new Error('Browser tests timed out.');
  for(const entry of result.checks??[])console.log('✓ '+entry);
  if(result.error)throw new Error(result.error);
  console.log(`Browser integration: ${result.checks.length} checks passed.`);
} finally {
  socket?.close();chrome.kill('SIGTERM');server.close();
  await new Promise(resolve=>setTimeout(resolve,200));
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
