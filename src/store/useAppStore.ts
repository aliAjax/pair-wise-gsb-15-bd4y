import {create} from 'zustand';
import {workflows as seedWorkflows} from '../../mock-data/workflows';
import {instances as seedInstances} from '../../mock-data/instances';
import type {FieldType,FlowEdge,FlowNode,FormField,PublishResult,PublishRejectRow,ValidationIssue,Workflow} from '../types';
import {buildRejectRows,clone,collectFields,syncFieldRefs,validateWorkflow} from '../services/flowDomain';
import {hydrate,saveState} from '../services/persistence';

const initial=hydrate({workflows:clone(seedWorkflows),instances:clone(seedInstances)});

const NOW='2026-07-11 16:30', PUBLISH_AT='2026-07-11 16:35';

interface State{
 workflows:Workflow[];instances:typeof initial.instances;
 currentId:string;selectedNodeId:string|null;
 issues:ValidationIssue[];toast:string;
 rejectRows:PublishRejectRow[]|null;
 setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;
 updateNodes:(nodes:FlowNode[])=>void;updateEdges:(edges:FlowEdge[])=>void;
 updateConfig:(id:string,config:Record<string,any>)=>void;
 addField:(nodeId:string,field:Omit<FormField,'id'>)=>void;
 updateField:(nodeId:string,fieldId:string,patch:Partial<Omit<FormField,'id'>>)=>void;
 removeField:(nodeId:string,fieldId:string)=>void;
 fixCondition:(nodeId:string,fieldId:string)=>void;
 runValidation:()=>ValidationIssue[];save:()=>void;publish:()=>PublishResult;
 dismissReject:()=>void;
 create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;restore:(v:number)=>void;clearToast:()=>void;
}

const newFieldId=()=>'fld-'+Math.random().toString(36).slice(2,8);

/** 以 prev 字段表同步依赖后产出新的 workflow 列表 */
const withWorkflow=(workflows:Workflow[],currentId:string,fn:(w:Workflow)=>Workflow):Workflow[]=>
 workflows.map(w=>w.id===currentId?fn(w):w);

export const useAppStore=create<State>((set,get)=>({
 workflows:initial.workflows,instances:initial.instances,
 currentId:'wf-1',selectedNodeId:null,issues:[],toast:'',rejectRows:null,

 setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[],rejectRows:null}),
 selectNode:id=>set({selectedNodeId:id}),

 updateNodes:nodes=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>({...w,nodes}))})),
 updateEdges:edges=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>({...w,edges}))})),

 updateConfig:(id,config)=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>{
   const target=w.nodes.find(n=>n.id===id);
   let next={...w,nodes:w.nodes.map(n=>n.id===id?{...n,data:{...n.data,config:{...n.data.config,...config},state:'configuring' as const}}:n)};
   if(target?.type==='form')next=syncFieldRefs(next,collectFields(w));
   return next;
  })})),

 addField:(nodeId,field)=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>{
   const f:FormField={...field,id:newFieldId()};
   return syncFieldRefs({...w,nodes:w.nodes.map(n=>n.id===nodeId?{...n,data:{...n.data,config:{...n.data.config,fields:[...(n.data.config.fields??[]),f]}}}:n)},collectFields(w));
  })})),

 updateField:(nodeId,fieldId,patch)=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>{
   return syncFieldRefs({...w,nodes:w.nodes.map(n=>n.id===nodeId?{...n,data:{...n.data,config:{...n.data.config,fields:(n.data.config.fields??[]).map((f:FormField)=>f.id===fieldId?{...f,...patch}:f)}}}:n)},collectFields(w));
  })})),

 removeField:(nodeId,fieldId)=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>{
   return syncFieldRefs({...w,nodes:w.nodes.map(n=>n.id===nodeId?{...n,data:{...n.data,config:{...n.data.config,fields:(n.data.config.fields??[]).filter((f:FormField)=>f.id!==fieldId)}}}:n)},collectFields(w));
  })})),

 /** 人工修复待修复条件节点：重新选择有效字段，清除失效档案 */
 fixCondition:(nodeId,fieldId)=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>({
   ...w,nodes:w.nodes.map(n=>n.id===nodeId?{...n,data:{...n.data,state:'configuring',config:{...n.data.config,ruleType:fieldId,brokenRef:undefined}}}:n)
  })),issues:get().issues.filter(i=>i.nodeId!==nodeId)})),

 runValidation:()=>{
  const w=get().workflows.find(x=>x.id===get().currentId)!;
  const issues=validateWorkflow(w);
  const errNodes=new Set(issues.map(i=>i.nodeId));
  set(s=>({
   issues,
   workflows:s.workflows.map(x=>x.id===w.id?{
    ...x,
    nodes:x.nodes.map(n=>{
     if(n.data.config.brokenRef)return {...n,data:{...n.data,state:'pendingFix'}}; // 失效引用永远停在待修复
     if(errNodes.has(n.id))return {...n,data:{...n.data,state:'invalid'}};
     return n.data.state==='pendingFix'?n:{...n,data:{...n.data,state:'valid'}};
    }),
    // 校验通过时冻结“最近一次已校验草稿”，供只读预览使用
    lastValid:issues.length===0?{at:NOW,nodes:clone(x.nodes),edges:clone(x.edges),fields:collectFields(x)}:x.lastValid,
   }:x),
   toast:issues.length?`发现 ${issues.length} 个问题`:'校验通过，草稿已标记为可预览',
  }));
  return issues;
 },

 save:()=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>({...w,status:'draft',updatedAt:NOW})),toast:'草稿已保存'})),

 publish:()=>{
  const w=get().workflows.find(x=>x.id===get().currentId)!;
  const rows=buildRejectRows(w);
  if(rows.length){
   set({rejectRows:rows,toast:`发布被拒绝：${rows.length} 项问题待修复`});
   return {ok:false,rows,published:[]};
  }
  const version=w.version+1;
  set(s=>({workflows:s.workflows.map(x=>x.id===w.id?{
    ...x,status:'published',version,publishedAt:PUBLISH_AT,updatedAt:PUBLISH_AT,
    versions:[...x.versions,{version,createdAt:PUBLISH_AT,note:'发布最新审批配置与表单字段',nodes:clone(x.nodes),edges:clone(x.edges),fieldSnapshot:{version,frozenAt:PUBLISH_AT,fields:collectFields(x)}}],
   }:x),toast:`流程发布成功，已冻结 ${collectFields(w).length} 个字段快照`}));
  return {ok:true,rows:[],published:[w.id]};
 },

 dismissReject:()=>set({rejectRows:null}),

 create:()=>{
  const id='wf-'+Date.now();
  set(s=>({workflows:[{id,name:'未命名流程',domain:'财务',status:'draft',version:0,editor:'林秋',updatedAt:'2026-07-11 16:40',abnormalCount:0,nodes:[],edges:[],versions:[]},...s.workflows],currentId:id,issues:[],rejectRows:null}));
  return id;
 },

 copy:id=>set(s=>{
  const w=s.workflows.find(x=>x.id===id)!;
  return {workflows:[{...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft',lastValid:undefined},...s.workflows]};
 }),

 archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),

 restore:v=>set(s=>({workflows:withWorkflow(s.workflows,s.currentId,w=>{
   const old=w.versions.find(x=>x.version===v)!;
   return {...w,status:'draft',nodes:clone(old.nodes),edges:clone(old.edges),lastValid:undefined};
  }),toast:`已恢复 v${v} 为草稿`,issues:[]})),

 clearToast:()=>set({toast:''}),
}));

// 任何状态变化后落盘：刷新后草稿、依赖、发布快照、实例保持一致
useAppStore.subscribe(s=>saveState({workflows:s.workflows,instances:s.instances}));
