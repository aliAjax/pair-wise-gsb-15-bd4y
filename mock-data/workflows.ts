import type {FieldSnapshot,FlowEdge,FlowNode,FormField,LastValid,Workflow} from '../src/types';

const baseFields:FormField[]=[
 {id:'reason',label:'申请说明',type:'text',required:true},
 {id:'amount',label:'申请金额',type:'amount',required:true},
 {id:'attachment',label:'附件',type:'attachment',required:false},
];
const n=(id:string,type:FlowNode['type'],x:number,y:number,label:string,config:Record<string,any>={}):FlowNode=>({id,type,position:{x,y},data:{label,state:Object.keys(config).length?'valid':'unconfigured',config}});
const standard=(broken=false,fields:FormField[]=baseFields)=>{
 const nodes=[
  n('start','start',20,150,'开始',{ok:true}),
  n('form','form',210,150,'提交申请',{fields}),
  n('approval','approval',420,150,'直属主管审批',{approverSource:'直属主管',instruction:'请确认申请内容与预算归属'}),
  n('condition','condition',630,150,'金额判断',broken?{}:{ruleType:'amount',operator:'>',value:5000}),
  n('notify','notify',850,40,'高额通知',{targets:'财务审批人',template:'高额申请提醒',timing:'分支进入时'}),
  n('automation','automation',850,260,'记录系统',{action:'写入系统记录'}),
  n('end','end',1070,150,'结束',{ok:true}),
 ];
 const edges:FlowEdge[]=[['start','form'],['form','approval'],['approval','condition'],['condition','notify','大于 5,000'],['condition','automation','其他'],['notify','end'],['automation','end']].map((e,i)=>({id:'e'+i,source:e[0],target:e[1],label:e[2]}));
 return {nodes,edges};
};
const v1Snapshot:FieldSnapshot={version:1,frozenAt:'2026-06-12 10:00',fields:baseFields};
const v2Snapshot:FieldSnapshot={version:2,frozenAt:'2026-07-01 16:20',fields:baseFields};
/** 已通过校验的标准草稿，作为“只读已校验预览”的数据源（破损草稿预览它） */
const validDraft=(fields:FormField[]=baseFields):LastValid=>{const g=standard(false,fields);return{at:'2026-07-11 15:50',nodes:g.nodes,edges:g.edges,fields}};
const names=['差旅费用审批','采购合同审批','员工入职流程','IT 服务请求','用印申请','供应商准入','年度预算调整','客户退款审批','法务审查流程','资产领用审批','营销活动报备','跨区域大型采购及多部门联合审批流程（集团特别管控版）'];
export const workflows:Workflow[]=names.map((name,i)=>{
 if(i===10)return {id:'wf-'+(i+1),name,domain:['财务','采购','人力资源','IT服务','法务'][i%5],status:'draft',version:2,editor:'林秋',updatedAt:'2026-07-10 09:20',abnormalCount:0,nodes:[],edges:[],versions:[],lastValid:undefined};
 // wf-2 草稿里有一个尚未发布的新字段“成本中心”，旧实例详情不应展示它
 const fields:FormField[]=i===1?[...baseFields,{id:'costCenter',label:'成本中心',type:'select',required:false,options:['研发','市场','行政']}]:baseFields;
 const graph=standard(i===0||i===3,fields);
 if(i===8)graph.nodes=graph.nodes.filter(x=>x.type!=='end');
 if(i===9)graph.nodes.push(n('orphan','approval',650,390,'孤立审批',{}));
 const status:Workflow['status']=i%4===0?'draft':i%5===0?'archived':'published';
 const oldNodes=graph.nodes.filter(x=>x.id!=='notify').map(x=>({...x,data:{...x.data}}));
 const snapNodes=graph.nodes.map(x=>x.type==='form'?{...x,data:{...x.data,config:{...x.data.config,fields:baseFields}}}:x);
 return {
  id:'wf-'+(i+1),name,domain:['财务','采购','人力资源','IT服务','法务'][i%5],status,version:i%3+1,
  editor:['林秋','陈默','周礼','王宁'][i%4],updatedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${9+i%8}:20`,
  publishedAt:status==='published'?'2026-07-08 14:30':undefined,abnormalCount:i===7?0:i%4,
  nodes:graph.nodes,edges:graph.edges,
  versions:[
   {version:1,createdAt:'2026-06-12 10:00',note:'初始化流程结构',nodes:oldNodes,edges:graph.edges.filter(e=>e.source!=='notify'&&e.target!=='notify'),fieldSnapshot:v1Snapshot},
   {version:2,createdAt:'2026-07-01 16:20',note:'增加金额分支与通知节点',nodes:snapNodes,edges:graph.edges,fieldSnapshot:v2Snapshot},
  ],
  lastValid:validDraft(fields),
 };
});
