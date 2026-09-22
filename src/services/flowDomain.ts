import type {FieldType,FlowNode,FormField,PublishRejectRow,ValidationIssue,Workflow} from '../types';

export const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));

export const FIELD_TYPES:{value:FieldType;label:string}[]=[
 {value:'text',label:'文本 text'},
 {value:'number',label:'数值 number'},
 {value:'amount',label:'金额 amount'},
 {value:'date',label:'日期 date'},
 {value:'select',label:'下拉 select'},
 {value:'attachment',label:'附件 attachment'},
];

/** 全流程的表单字段（当前每个流程一个表单节点，多节点时自然聚合） */
export const collectFields=(w:Pick<Workflow,'nodes'>):FormField[]=>
 w.nodes.filter(n=>n.type==='form').flatMap(n=>n.data.config.fields??[]);

export const fieldById=(w:Pick<Workflow,'nodes'>,id?:string|null)=>
 collectFields(w).find(f=>f.id===id);

/** 仅数值/金额字段可以作为大小判断的条件字段 */
export const isComparable=(t?:FieldType)=>t==='number'||t==='amount';
const conditionFieldId=(n:FlowNode)=>String(n.data.config.ruleType??'');

/**
 * 同步条件节点对表单字段的依赖：
 * - 新增字段：自动出现在条件节点的可选字段列表；
 * - 改标识：引用旧 id 的条件节点自动改写为新 id（依赖跟随）；
 * - 字段被移除 / 改类型：引用它的条件节点停在“待修复(pendingFix)”并留存旧值档案；
 * - 字段恢复（同 id 或同标识同类型回来）：自动解除待修复。
 */
export function syncFieldRefs(w:Workflow,prevFields:FormField[]):Workflow{
 const nowFields=collectFields(w);
 const prevIds=new Set(prevFields.map(f=>f.id));
 const renamed:[string,string][]=[];
 const damaged=new Map<string,{reason:'removed'|'typeChanged';old:FormField;newType:FieldType|null}>();
 prevFields.forEach(old=>{
  const same=nowFields.find(f=>f.id===old.id);
  if(same){if(same.type!==old.type)damaged.set(old.id,{reason:'typeChanged',old,newType:same.type});return;}
  const moved=nowFields.find(f=>f.label===old.label&&f.type===old.type&&!prevIds.has(f.id));
  if(moved)renamed.push([old.id,moved.id]);
  else damaged.set(old.id,{reason:'removed',old,newType:null});
 });
 const stamp='2026-07-11 16:30';
 let touched=false;
 const nodes=w.nodes.map((n):FlowNode=>{
  if(n.type!=='condition')return n;
  const config={...n.data.config};
  let ref=conditionFieldId(n);
  let changed=false;
  const b=config.brokenRef;
  if(!ref&&b){
   const healed=nowFields.find(f=>f.id===b.fieldId)||nowFields.find(f=>f.label===b.fieldLabel&&f.type===b.oldType);
   if(healed){ref=healed.id;config.ruleType=healed.id;delete config.brokenRef;changed=true;}
   else return n; // 仍待修复，保持 pendingFix 与档案
  }
  if(!ref)return n;
  const r=renamed.find(([o])=>o===ref);
  if(r){ref=r[1];config.ruleType=ref;changed=true;}
  const dmg=damaged.get(ref);
  if(dmg){
   config.brokenRef={fieldId:ref,fieldLabel:dmg.old.label,reason:dmg.reason,oldType:dmg.old.type,newType:dmg.newType,since:stamp};
   config.ruleType='';
   touched=true;
   return {...n,data:{...n.data,config,state:'pendingFix'}};
  }
  if(config.brokenRef){delete config.brokenRef;changed=true;}
  if(!changed)return n;
  touched=true;
  return {...n,data:{...n.data,config,state:(n.data.state==='pendingFix'?'configuring':n.data.state) as FlowNode['data']['state']}};
 });
 return touched?{...w,nodes}:w;
}

export const hasBrokenRef=(n:FlowNode)=>Boolean(n.data.config.brokenRef);

/** 结构 + 字段依赖校验：失效引用永远是错误，节点停在待修复 */
export function validateWorkflow(w:Workflow):ValidationIssue[]{
 const issues:ValidationIssue[]=[];
 if(!w.nodes.some(n=>n.type==='end'))issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'});
 const linked=new Set(w.edges.flatMap(e=>[e.source,e.target]));
 w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,level:'error',message:'必经节点不能孤立'}));
 const fields=collectFields(w);
 w.nodes.forEach(n=>{
  if(n.type==='condition'){
   const b=n.data.config.brokenRef;
   if(b)issues.push({nodeId:n.id,level:'error',message:b.reason==='removed'?`引用字段「${b.fieldLabel}」已被移除，节点待修复`:`引用字段「${b.fieldLabel}」类型由 ${b.oldType} 改为 ${b.newType}，节点待修复`});
   else if(!n.data.config.ruleType)issues.push({nodeId:n.id,level:'error',message:'条件分支规则未配置'});
   else if(!fields.some(f=>f.id===n.data.config.ruleType))issues.push({nodeId:n.id,level:'error',message:'条件引用的字段不存在'});
  }
  if(n.type==='approval'&&!n.data.config.approverSource)issues.push({nodeId:n.id,level:'error',message:'审批人不能为空'});
 });
 return issues;
}

/** 发布拒绝报告：每个错误一行（流程 / 字段 / 节点 / 旧值 / 新值），整批拒绝 */
export function buildRejectRows(w:Workflow):PublishRejectRow[]{
 return validateWorkflow(w).filter(i=>i.level==='error').map(i=>{
  const n=w.nodes.find(x=>x.id===i.nodeId);
  const b=n?.data.config.brokenRef;
  if(n&&b)return {
   workflowId:w.id,workflowName:w.name,nodeId:n.id,nodeLabel:n.data.label,
   fieldId:b.fieldId,fieldLabel:b.fieldLabel,
   reason:b.reason==='removed'?'字段被移除':'字段类型变更',
   oldValue:b.reason==='removed'?`${b.fieldLabel} · ${b.oldType}`:`字段类型：${b.oldType}`,
   newValue:b.reason==='removed'?'已删除（字段不存在）':`字段类型：${b.newType??'—'}`,
  };
  return {
   workflowId:w.id,workflowName:w.name,nodeId:i.nodeId,
   nodeLabel:n?.data.label??'流程整体',fieldId:'—',fieldLabel:'—',
   reason:i.message,oldValue:'—',newValue:'—',
  };
 });
}

/** 实例沿用于发布时字段：取 <= 实例版本 的最近快照；没有快照时退回当前字段（旧数据兼容） */
export function fieldsForInstance(w:Workflow,flowVersion:number):FormField[]{
 const v=[...w.versions].filter(x=>x.version<=flowVersion).sort((a,b)=>b.version-a.version)[0]
   ??w.versions.find(x=>x.version===w.version);
 return clone(v?.fieldSnapshot?.fields??collectFields(w));
}
