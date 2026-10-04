const config=window.parent.testConfig??{};
const video=document.querySelector('#video');
let stream=null, frame=0, permissionGranted=false;
const callbacks=new Map();let callbackId=0;
class Track extends EventTarget {
  constructor(label,id){super();this.label=label;this.readyState='live';this.settings={deviceId:id,width:1920,height:1080,frameRate:5,exposureMode:'continuous',whiteBalanceMode:'continuous',exposureTime:100,colorTemperature:4600,brightness:0,contrast:32,saturation:50,sharpness:1};this.applied=[];}
  getSettings(){return {...this.settings};}
  getCapabilities(){return {exposureMode:['manual','continuous'],whiteBalanceMode:['manual','continuous'],exposureTime:{min:1,max:10000,step:1},colorTemperature:{min:2800,max:6500,step:1},brightness:{min:-64,max:64,step:1},contrast:{min:0,max:64,step:1},saturation:{min:0,max:100,step:1},sharpness:{min:0,max:10,step:1}};}
  async applyConstraints(constraints){
    this.applied.push(structuredClone(constraints));
    if(this.readyState==='ended')throw new DOMException('Track ended','InvalidStateError');
    if(constraints.advanced){if(!window.ignoreFakeConstraints)Object.assign(this.settings,constraints.advanced[0]);return;}
    if(config.fallback && constraints.width?.exact===1920)throw new DOMException('Fallback mode','OverconstrainedError');
    this.settings.width=config.fallback?1280:constraints.width?.exact??constraints.width?.ideal??this.settings.width;
    this.settings.height=config.fallback?720:constraints.height?.exact??constraints.height?.ideal??this.settings.height;
    this.settings.frameRate=constraints.frameRate?.exact??constraints.frameRate?.ideal??5;
  }
  stop(){this.readyState='ended';}
}
window.fakeTracks=[];window.fakeRequests=[];
Object.defineProperty(navigator,'mediaDevices',{value:{
  enumerateDevices:async()=>[{kind:'videoinput',deviceId:'hp',label:config.hiddenLabels && !permissionGranted?'':'HP Camera'},{kind:'videoinput',deviceId:'usb-new',label:config.hiddenLabels && !permissionGranted?'':'USB 2.0 Camera: USB-ZH'}],
  getUserMedia:async constraints=>{
    window.fakeRequests.push(structuredClone(constraints));
    const id=constraints.video?.deviceId?.exact;
    if(id==='usb-old')throw new DOMException('Stale deviceId','NotFoundError');
    const track=new Track(id==='usb-new'?'USB 2.0 Camera: USB-ZH':'HP Camera',id??'hp');
    window.fakeTracks.push(track);
    permissionGranted=true;
    if(config.delayPermission)await new Promise(resolve=>setTimeout(resolve,80));
    return {getTracks:()=>[track],getVideoTracks:()=>[track]};
  },
}});
Object.defineProperties(video,{
  srcObject:{get:()=>stream,set:value=>{stream=value;}},
  videoWidth:{get:()=>stream?.getVideoTracks()[0].settings.width??0},
  videoHeight:{get:()=>stream?.getVideoTracks()[0].settings.height??0},
  currentTime:{get:()=>frame/5},readyState:{get:()=>stream?2:0},
});
video.play=async()=>{};
video.requestVideoFrameCallback=callback=>{const id=++callbackId;callbacks.set(id,callback);return id;};
video.cancelVideoFrameCallback=id=>callbacks.delete(id);
window.freezeFakeFrames=false;
const timer=setInterval(()=>{
  if(!stream || stream.getTracks()[0].readyState==='ended' || window.freezeFakeFrames)return;
  frame++;
  const pending=[...callbacks.values()];callbacks.clear();
  for(const callback of pending)callback(performance.now()+frame*200,{mediaTime:frame/5,presentedFrames:frame});
},10);
window.addEventListener('unload',()=>clearInterval(timer));
const canvas=document.createElement('canvas');const context=canvas.getContext('2d');
const original=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
  if(source===video){
    canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const exposure=stream.getTracks()[0].settings.exposureTime;
    const intensity=Math.min(255,Math.round(exposure*8));
    context.fillStyle=`rgb(${intensity} ${intensity} ${intensity})`;context.fillRect(0,0,canvas.width,canvas.height);
    if(config.peaks){
      context.fillStyle='rgb(5 5 5)';context.fillRect(0,0,canvas.width,canvas.height);
      for(const center of [Math.round(canvas.width*.3),Math.round(canvas.width*.65)]){
        for(let dx=-18;dx<=18;dx++){
          const value=Math.min(255,Math.round(5+intensity*Math.exp(-dx*dx/30)));
          context.fillStyle=`rgb(${value} ${value} ${value})`;context.fillRect(center+dx,0,1,canvas.height);
        }
      }
    }
    // Distinct raw left/right channels permit real canvas orientation checks.
    context.fillStyle=`rgb(${intensity} 0 0)`;context.fillRect(0,0,4,canvas.height);
    context.fillStyle=`rgb(0 0 ${intensity})`;context.fillRect(canvas.width-4,0,4,canvas.height);
    return original.call(this,canvas,...args);
  }
  return original.call(this,source,...args);
};
if(config.canvasFallback){
  const append=document.head.append.bind(document.head);
  document.head.append=(...children)=>{
    for(const child of children){if(child.id==='uPlotScript'){queueMicrotask(()=>child.dispatchEvent(new Event('error')));}else append(child);}
  };
}

let uplot;
Object.defineProperty(window,'uPlot',{configurable:true,get:()=>uplot,set:Original=>{
  uplot=function(...args){const chart=new Original(...args);window.lastPlot=chart;return chart;};
  Object.assign(uplot,Original);
}});
window.legacyPlotDraws=0;
const plot=document.querySelector('#plotCanvas').getContext('2d');
const fill=plot.fillRect.bind(plot);
plot.fillRect=(...args)=>{window.legacyPlotDraws++;return fill(...args);};

window.fakeDownloads=[];
const originalClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){
  if(this.download && this.href.startsWith('blob:')){window.fakeDownloads.push({name:this.download,blob:fetch(this.href).then(response=>response.blob())});return;}
  originalClick.call(this);
};
