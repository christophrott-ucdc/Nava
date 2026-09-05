import test from 'node:test';import assert from 'node:assert/strict';
import {assessRehearsalVideo} from './technical-rehearsal';import type {PerfSample} from '../shared/types';
test('rehearsal qualification rejects stale, short, reset and heavily dropped video telemetry',()=>{
  const first={atMs:1000,videoTotal:0,videoDropped:0} as PerfSample;
  const last={atMs:600000,videoTotal:27800,videoDropped:10} as PerfSample;
  assert(assessRehearsalVideo(first,last,600,601000).passed);
  assert(!assessRehearsalVideo(first,last,600,610000).passed);
  assert(!assessRehearsalVideo({...first,atMs:500000},last,600,601000).passed);
  assert(!assessRehearsalVideo(first,{...last,videoTotal:30},600,601000).passed);
  assert(!assessRehearsalVideo(first,{...last,videoDropped:1000},600,601000).passed);
  assert(!assessRehearsalVideo(first,{...last,atMs:700000},600,601000).passed);
});
