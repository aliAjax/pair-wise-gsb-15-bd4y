import type {FieldImpact,FlowNode,FormField,ValidationIssue,Version,Workflow} from '../types';
// 纯规则层：字段依赖、校验与发布快照，不依赖界面与状态容器
export const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
export const formFields=(w:Workflow):FormField[]=>(w.nodes.find(n=>n.type==='form')?.data.config.fields||[]) as FormField[];
export const fieldTypeLabel=(t:string):string=>({text:'文本',number:'数字',amount:'金额',date:'日期',select:'单选',attachment:'附件'}as Record<string,string>)[t]||t;
type RepairDraft=Omit<FieldImpact,'workflowId'|'workflowName'|'nodeId'|'nodeLabel'>;
export const pendingRepairs=(w:Workflow):FieldImpact[]=>w.nodes.filter(n=>n.data.config.pendingRepair).map(n=>({workflowId:w.id,workflowName:w.name,nodeId:n.id,nodeLabel:n.data.label,...n.data.config.pendingRepair}));
export const versionFields=(v:Version):FormField[]=>v.fields||((v.nodes.find(n=>n.type==='form')?.data.config.fields||[]) as FormField[]);
export const latestVersion=(w:Workflow):Version|undefined=>[...w.versions].sort((a,b)=>b.version-a.version)[0];
export type FieldChange=
 |{kind:'add';field:FormField}
 |{kind:'rename';oldId:string;field:FormField}
 |{kind:'remove';fieldId:string}
 |{kind:'retype';fieldId:string;type:FormField['type']}
 |{kind:'require';fieldId:string;required:boolean};
// 字段变更规则：新增/改标识同步依赖；移除/改类型让引用条件节点停在待修复并记录旧新值
export function applyFieldChange(w:Workflow,change:FieldChange):{nodes:FlowNode[];impacts:FieldImpact[]}{
 const fields=formFields(w);const impacts:FieldImpact[]=[];let nodes=w.nodes;
 const setFields=(fs:FormField[])=>{nodes=nodes.map(n=>n.type==='form'?{...n,data:{...n.data,state:'configuring',config:{...n.data.config,fields:fs}}}:n)};
 const markPending=(fieldId:string,make:(f:FormField)=>RepairDraft)=>{
  const f=fields.find(x=>x.id===fieldId);if(!f)return;
  nodes=nodes.map(n=>{if(n.type!=='condition'||n.data.config.ruleType!==fieldId)return n;const pr=make(f);impacts.push({workflowId:w.id,workflowName:w.name,nodeId:n.id,nodeLabel:n.data.label,...pr});return{...n,data:{...n.data,state:'pending',config:{...n.data.config,pendingRepair:pr}}}});
 };
 switch(change.kind){
  case 'add':setFields([...fields,change.field]);break;
  case 'require':setFields(fields.map(f=>f.id===change.fieldId?{...f,required:change.required}:f));break;
  case 'rename':
   setFields(fields.map(f=>f.id===change.oldId?change.field:f));
   if(change.oldId!==change.field.id)nodes=nodes.map(n=>n.type==='condition'&&n.data.config.ruleType===change.oldId?{...n,data:{...n.data,config:{...n.data.config,ruleType:change.field.id}}}:n);
   break;
  case 'remove':
   markPending(change.fieldId,f=>({fieldId:f.id,fieldLabel:f.label,kind:'removed',oldValue:`${f.label}（${fieldTypeLabel(f.type)}）`,newValue:'字段已移除'}));
   setFields(fields.filter(f=>f.id!==change.fieldId));break;
  case 'retype':{
   const old=fields.find(f=>f.id===change.fieldId);
   if(old&&old.type!==change.type)markPending(change.fieldId,f=>({fieldId:f.id,fieldLabel:f.label,kind:'type-changed',oldValue:fieldTypeLabel(old.type),newValue:fieldTypeLabel(change.type)}));
   setFields(fields.map(f=>f.id===change.fieldId?{...f,type:change.type}:f));break;
  }
 }
 return{nodes,impacts};
}
export function validateWorkflow(w:Workflow):ValidationIssue[]{
 const issues:ValidationIssue[]=[];
 if(!w.nodes.some(n=>n.type==='end'))issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'});
 const linked=new Set(w.edges.flatMap(e=>[e.source,e.target]));
 w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,level:'error',message:'必经节点不能孤立'}));
 const ids=new Set(formFields(w).map(f=>f.id));
 w.nodes.forEach(n=>{
  if(n.type==='condition'){
   const pr=n.data.config.pendingRepair;
   if(pr)issues.push({nodeId:n.id,level:'error',message:`条件分支引用的表单字段待修复（${pr.fieldLabel}）`});
   else if(!n.data.config.ruleType)issues.push({nodeId:n.id,level:'error',message:'条件分支规则未配置'});
   else if(!ids.has(n.data.config.ruleType))issues.push({nodeId:n.id,level:'error',message:'条件分支引用的表单字段待修复'});
  }
  if(n.type==='approval'&&!n.data.config.approverSource)issues.push({nodeId:n.id,level:'error',message:'审批人不能为空'});
 });
 return issues;
}
