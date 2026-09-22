import type {Instance} from '../src/types';
import {domains,users} from './catalog';

/** 实例启动时冻结的字段数据：只含发布快照中的字段（无后续新增字段） */
const formDataFor=(i:number,wf:number)=>{
 const data:Record<string,string>={
  reason:['上海客户现场支持差旅','季度市场活动物料采购','新员工入职设备申请','跨部门合同用印材料','供应商资质复审'][i%5],
  amount:String((i%9+1)*1280+320),
  attachment:i%4===0?'':`附件-${(i%7)+1}.pdf`,
 };
 /** 即使实例数据里存在快照之外的字段（如草稿后来新增的成本中心），详情也只渲染快照字段 */
 if(wf===2)data.costCenter='研发';
 return data;
};
export const instances:Instance[]=Array.from({length:80},(_,k)=>{
 const i=k;
 const wf=i%12+1;
 const status:Instance['status']=i<12?'abnormal':i<22?'timeout':i<50?'running':'completed';
 // 70% 实例仍运行在 v1，其余在最新发布版本；新版本之后草稿新增的字段不会出现在实例中
 const flowVersion=i%10<7?1:(wf%3)+1;
 return {
  id:`INS-2026-${String(i+1).padStart(4,'0')}`,workflowId:`wf-${wf}`,
  applicant:users[i%8],domain:domains[i%5],
  currentNode:i%3===0?'直属主管审批':'金额判断',status,
  submittedAt:`2026-07-${String(10-i%9).padStart(2,'0')} ${String(8+i%10).padStart(2,'0')}:10`,
  duration:status==='timeout'?`${28+i}h`:`${i%9+1}h ${i%6*10}m`,
  risk:i<22?'high':i<45?'medium':'low',
  flowVersion,formData:formDataFor(i,wf),
  timeline:[
   {title:'提交申请',time:'09:10',status:'completed'},
   {title:'直属主管审批',time:'10:24',status:i%3===0?'current':'completed'},
   {title:'金额判断',time:'11:05',status:i%3!==0?'current':'pending'},
  ],
 };
});
