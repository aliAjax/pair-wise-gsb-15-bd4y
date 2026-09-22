import {create} from 'zustand'; import {workflows as seed} from '../../mock-data/workflows'; import {instances as seedInstances} from '../../mock-data/instances'; import type {FlowEdge,FlowNode,Instance,PublishRejection,ValidationIssue,Version,Workflow} from '../types'; import {applyFieldChange,clone,formFields,pendingRepairs,validateWorkflow,type FieldChange} from '../rules/fields';
const KEY='flowdesk-studio-v1';
const load=():{workflows:Workflow[];instances:Instance[];validated:Record<string,boolean>}|null=>{try{const raw=localStorage.getItem(KEY);if(raw){const p=JSON.parse(raw);if(p&&Array.isArray(p.workflows)&&Array.isArray(p.instances))return p}}catch{}return null};
const persisted=typeof localStorage!=='undefined'?load():null;
interface State{workflows:Workflow[];instances:Instance[];validated:Record<string,boolean>;currentId:string;selectedNodeId:string|null;issues:ValidationIssue[];rejection:PublishRejection|null;toast:string;setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;updateNodes:(nodes:FlowNode[])=>void;updateEdges:(edges:FlowEdge[])=>void;updateConfig:(id:string,config:Record<string,any>)=>void;changeField:(change:FieldChange)=>void;resolveRepair:(nodeId:string,fieldId:string)=>void;runValidation:()=>ValidationIssue[];save:()=>void;publish:()=>void;closeRejection:()=>void;create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;restore:(v:number)=>void;clearToast:()=>void}
const touch=(v:Record<string,boolean>,id:string)=>({...v,[id]:false});
const mapCurrent=(s:{workflows:Workflow[];currentId:string},fn:(w:Workflow)=>Workflow)=>s.workflows.map(w=>w.id===s.currentId?fn(w):w);
export const useAppStore=create<State>((set,get)=>({
 workflows:persisted?persisted.workflows:clone(seed),instances:persisted?persisted.instances:seedInstances,validated:persisted?persisted.validated:{},
 currentId:'wf-1',selectedNodeId:null,issues:[],rejection:null,toast:'',
 setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[],rejection:null}),
 selectNode:id=>set({selectedNodeId:id}),
 updateNodes:nodes=>set(s=>({validated:touch(s.validated,s.currentId),workflows:mapCurrent(s,w=>({...w,nodes}))})),
 updateEdges:edges=>set(s=>({validated:touch(s.validated,s.currentId),workflows:mapCurrent(s,w=>({...w,edges}))})),
 updateConfig:(id,config)=>set(s=>({validated:touch(s.validated,s.currentId),workflows:mapCurrent(s,w=>({...w,nodes:w.nodes.map(n=>{if(n.id!==id)return n;const merged={...n.data.config,...config};if('ruleType' in config)delete merged.pendingRepair;return{...n,data:{...n.data,state:merged.pendingRepair?'pending':'configuring',config:merged}}})}))})),
 changeField:change=>set(s=>{
  const w=s.workflows.find(x=>x.id===s.currentId)!;
  if(change.kind==='add'&&(!change.field.id.trim()||formFields(w).some(f=>f.id===change.field.id.trim())))return{toast:'字段标识为空或已存在'};
  if(change.kind==='rename'&&change.field.id!==change.oldId&&formFields(w).some(f=>f.id===change.field.id))return{toast:'字段标识已存在'};
  const {nodes,impacts}=applyFieldChange(w,change);
  return{validated:touch(s.validated,s.currentId),workflows:mapCurrent(s,x=>({...x,nodes})),toast:impacts.length?`${impacts.length} 个条件节点进入待修复`:change.kind==='rename'&&change.oldId!==change.field.id?'字段标识已更新，依赖已同步':'字段已更新'};
 }),
 resolveRepair:(nodeId,fieldId)=>set(s=>({validated:touch(s.validated,s.currentId),workflows:mapCurrent(s,w=>({...w,nodes:w.nodes.map(n=>{if(n.id!==nodeId)return n;const config:Record<string,any>={...n.data.config,ruleType:fieldId};delete config.pendingRepair;return{...n,data:{...n.data,state:'configuring',config}}})})),toast:'依赖已修复，请重新校验'})),
 runValidation:()=>{const w=get().workflows.find(x=>x.id===get().currentId)!;const issues=validateWorkflow(w);set(s=>({issues,validated:{...s.validated,[w.id]:issues.length===0},workflows:mapCurrent(s,flow=>({...flow,nodes:flow.nodes.map(n=>({...n,data:{...n.data,state:n.data.config.pendingRepair?'pending':issues.some(i=>i.nodeId===n.id)?'invalid':'valid'}}))})),toast:issues.length?`发现 ${issues.length} 个问题`:'校验通过'}));return issues},
 save:()=>set(s=>({workflows:mapCurrent(s,w=>({...w,status:'draft',updatedAt:'2026-09-22 10:00'})),toast:'草稿已保存'})),
 publish:()=>{const w=get().workflows.find(x=>x.id===get().currentId)!;const issues=validateWorkflow(w);
  if(issues.length){set(s=>({issues,rejection:{workflowId:w.id,workflowName:w.name,impacts:pendingRepairs(w),issues},validated:{...s.validated,[w.id]:false},toast:`发布被整批拒绝：${issues.length} 个问题需修复`}));return}
  set(s=>({issues:[],rejection:null,validated:{...s.validated,[w.id]:true},toast:'流程发布成功',workflows:mapCurrent(s,flow=>{const version:Version={version:flow.version+1,createdAt:'2026-09-22 10:00',note:'发布最新审批配置',nodes:clone(flow.nodes),edges:clone(flow.edges),fields:clone(formFields(flow))};return{...flow,status:'published',version:flow.version+1,publishedAt:'2026-09-22 10:00',updatedAt:'2026-09-22 10:00',versions:[...flow.versions,version]}})}));},
 closeRejection:()=>set({rejection:null}),
 create:()=>{const id='wf-'+Date.now();set(s=>({workflows:[{id,name:'未命名流程',domain:'财务',status:'draft',version:0,editor:'林秋',updatedAt:'2026-09-22 10:00',abnormalCount:0,nodes:[],edges:[],versions:[]},...s.workflows],currentId:id}));return id},
 copy:id=>set(s=>{const w=s.workflows.find(x=>x.id===id)!;return{workflows:[{...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft'},...s.workflows]}}),
 archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),
 restore:v=>set(s=>({validated:touch(s.validated,s.currentId),workflows:mapCurrent(s,w=>{const old=w.versions.find(x=>x.version===v)!;return{...w,status:'draft',nodes:clone(old.nodes),edges:clone(old.edges)}}),toast:`已恢复 v${v} 为草稿`})),
 clearToast:()=>set({toast:''})
}));
useAppStore.subscribe(s=>{try{localStorage.setItem(KEY,JSON.stringify({workflows:s.workflows,instances:s.instances,validated:s.validated}))}catch{}});
