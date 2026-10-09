import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSnapshot, synchronizeSnapshot } from '../lib/snapshot-state.ts';
const snapshot={mode:'live',game:'g1',version:'v1',sales:[],inventory:[],products:[]};
function dependencies(overrides={}) {
  const events=[];
  return { events, cached:null, acquire:async()=>true, read:async()=>snapshot,
    persist:async()=>{events.push('persist');},markFailure:async()=>{events.push('failure');},release:async()=>{events.push('release');}, ...overrides };
}
test('cache accepts only confirmed SAP data from the active game',()=>{
  assert.equal(confirmedSnapshot('invalid','g1'),null);
  assert.equal(confirmedSnapshot(JSON.stringify({...snapshot,mode:'demo'}),'g1'),null);
  assert.equal(confirmedSnapshot(JSON.stringify(snapshot),'other'),null);
  assert.deepEqual(confirmedSnapshot(JSON.stringify(snapshot),'g1'),snapshot);
});
test('first connection failure returns no figures and releases the lock',async()=>{
  const deps=dependencies({read:async()=>{throw new Error('SAP TLS error');}});
  const result=await synchronizeSnapshot(deps);
  assert.deepEqual(result,{snapshot:null,warning:'SAP TLS error'});
  assert.deepEqual(deps.events,['release']);
});
test('concurrent first sync has a loading state without fabricated values',async()=>{
  const deps=dependencies({acquire:async()=>false});
  assert.equal((await synchronizeSnapshot(deps)).snapshot,null);
  assert.deepEqual(deps.events,[]);
});
test('outage retains only the last confirmed SAP data and its warning',async()=>{
  const deps=dependencies({cached:snapshot,read:async()=>{throw new Error('SAP unavailable');}});
  const result=await synchronizeSnapshot(deps);
  assert.equal(result.snapshot,snapshot);
  assert.equal(result.warning,'SAP unavailable');
  assert.deepEqual(deps.events,['failure','release']);
});
test('successful sync persists real data before returning it',async()=>{
  const deps=dependencies();
  assert.deepEqual(await synchronizeSnapshot(deps),{snapshot,warning:null});
  assert.deepEqual(deps.events,['persist','release']);
});
