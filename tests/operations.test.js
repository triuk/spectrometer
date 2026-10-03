import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationController,abortable} from '../prototype/camera-operations.js';
import {waitForVideoFrame} from '../prototype/video-frames.js';
const fakeVideo = () => Object.assign(new EventTarget(),{currentTime:0,readyState:2,callbacks:new Map(),
  requestVideoFrameCallback(callback) {this.callbacks.set(1,callback); return 1;},
  cancelVideoFrameCallback(id) {this.callbacks.delete(id);}});
test('optimizer/diagnostics/manual cannot overlap and failure releases lock', async () => {
  const gate = createOperationController();
  let release;
  const task = gate.run('optimize', () => new Promise(resolve => release=resolve));
  await assert.rejects(gate.run('diagnostics',()=>{}),{name:'CameraBusyError'});
  await assert.rejects(gate.run('manual',()=>{}),{name:'CameraBusyError'});
  release(); await task;
  await assert.rejects(gate.run('manual',()=>{throw Error('failure');}));
  assert.equal(gate.active,null);
});
test('stalled video wait aborts and removes its callback', async () => {
  const gate = createOperationController(); const video = fakeVideo();
  const task = gate.run('optimize',({signal})=>waitForVideoFrame(video,{signal,timeoutMs:1000}));
  gate.cancel();
  await assert.rejects(task,{name:'AbortError'});
  assert.equal(video.callbacks.size,0); assert.equal(gate.active,null);
});
test('frame timeout and track ended free waiting operations', async () => {
  const video = fakeVideo();
  await assert.rejects(waitForVideoFrame(video,{timeoutMs:10}),/časovém limitu/);
  const track = Object.assign(new EventTarget(),{readyState:'live'});
  const waiting = waitForVideoFrame(video,{track}); track.dispatchEvent(new Event('ended'));
  await assert.rejects(waiting,{name:'AbortError'});
});
test('fallback waits for media time to advance, not merely a timer tick',async()=>{
  const video=Object.assign(new EventTarget(),{currentTime:2,readyState:2});
  let settled=false;
  const waiting=waitForVideoFrame(video,{timeoutMs:500}).then(frame=>{settled=true;return frame;});
  await new Promise(resolve=>setTimeout(resolve,50)); assert.equal(settled,false);
  video.currentTime=3; assert.equal((await waiting).metadata.mediaTime,3);
});
test('abortable camera request observes abort and timeout',async()=>{
  const controller=new AbortController();const waiting=abortable(new Promise(()=>{}),controller.signal);
  controller.abort();await assert.rejects(waiting,{name:'AbortError'});
  await assert.rejects(abortable(new Promise(()=>{}),undefined,10),/časovém limitu/);
});
