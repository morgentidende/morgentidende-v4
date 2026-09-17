import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumer} from './mcp-consumer.mjs';
import {validateMedia} from './media.mjs';
const base={id:'p',article_status:'published',enabled:true,status:'ready',network:'facebook',post_text:'Text',media_urls:[],updated_at:'2026-01-01',scheduled_for:'2026-01-01'};
function setup(overrides={},reply={accepted:true,id:'1',plannerUrl:'https://app.metricool.com/planner'}) {
  let post={...base,...overrides},calls=0,saves=0;
  const query=async(sql,values)=>{
    if(sql.startsWith('select'))return [{...post}];
    if(sql.includes('attempts=attempts+1')) {if(post.status!=='ready')return [];post.status='failed';return [{id:'p'}];}
    saves++;if(overrides.saveFails)throw new Error('db');return [{id:'p'}];
  };
  return {run:consumer({query,schedule:async()=>{calls++;if(reply instanceof Error)throw reply;return reply;},validateMedia:async()=>{if(overrides.badMedia)throw new Error('bad');},uuid:()=> 'claim'}).consume,
    counts:()=>({calls,saves})};
}
test('default dry run cannot reserve or publish',async()=>{const x=setup();assert.equal((await x.run('p')).status,'dry_run');assert.deepEqual(x.counts(),{calls:0,saves:0});});
test('OFF blocks even explicitly requested execution',async()=>{const x=setup({enabled:false});assert.equal((await x.run('p',{dryRun:false})).status,'disabled');assert.equal(x.counts().calls,0);});
test('Instagram requires media',async()=>{const x=setup({network:'instagram'});assert.equal((await x.run('p',{dryRun:false})).error,'instagram_requires_media');assert.equal(x.counts().calls,0);});
test('invalid media is recorded before provider call',async()=>{const x=setup({badMedia:true});assert.equal((await x.run('p',{dryRun:false})).error,'invalid_media');assert.deepEqual(x.counts(),{calls:0,saves:1});});
test('concurrent consumers send at most once',async()=>{const x=setup();await Promise.all([x.run('p',{dryRun:false}),x.run('p',{dryRun:false})]);assert.equal(x.counts().calls,1);});
test('timeout stays unknown and cannot be sent again',async()=>{const x=setup({},new Error('timeout'));assert.equal((await x.run('p',{dryRun:false})).status,'provider_outcome_unknown');await x.run('p',{dryRun:false});assert.equal(x.counts().calls,1);});
test('receipt storage failure returns receipt and never resends',async()=>{const x=setup({saveFails:true});const r=await x.run('p',{dryRun:false});assert.equal(r.status,'receipt_not_saved');assert.ok(r.receipt);await x.run('p',{dryRun:false});assert.equal(x.counts().calls,1);});
test('unstructured MCP reply is preserved, never guessed successful',async()=>{const x=setup({}, {content:[{type:'text',text:'Maybe scheduled'}]});assert.equal((await x.run('p',{dryRun:false})).status,'provider_outcome_unknown');assert.equal(x.counts().saves,1);});
test('scheduled is not published',async()=>{const x=setup();assert.equal((await x.run('p',{dryRun:false})).status,'scheduled');});
test('unsafe media origin is rejected without network call',async()=>{let called=false;await assert.rejects(validateMedia(['https://127.0.0.1/a'],'instagram',async()=>{called=true;}));assert.equal(called,false);});
test('HTML disguised as PNG is rejected',async()=>{await assert.rejects(validateMedia(['https://media.morgentidende.dk/a'],'instagram',async()=>new Response('<html>not an image</html>',{headers:{'content-type':'image/png'}})));});

