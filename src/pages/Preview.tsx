import {useMemo,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Lock,RotateCcw} from 'lucide-react';
import {useAppStore} from '../store/useAppStore';

/**
 * 预览只读“最近一次已校验草稿(lastValid)”：
 * - 当前草稿存在失效字段依赖时，预览不会看到半改坏的结构；
 * - 从未通过校验的草稿无可预览内容。
 * - 结构只读（不能改配置/字段），表单内仍可输入值做分支模拟。
 */
export function Preview(){
 const nav=useNavigate(),{id}=useParams();
 const w=useAppStore(s=>s.workflows.find(x=>x.id===id))!;
 const snap=w.lastValid;
 const form=useMemo(()=>snap?.nodes.find(n=>n.type==='form'),[snap]);
 const condition=useMemo(()=>snap?.nodes.find(n=>n.type==='condition'),[snap]);
 const fields:any[]=form?.data.config.fields??[];
 const [values,setValues]=useState<Record<string,string>>({});
 const [submitted,setSubmitted]=useState(false);
 const amount=Number(values.amount??values[fields.find(f=>f.type==='amount')?.id??'']??0);
 const threshold=Number(condition?.data.config.value||5000);
 const branch=amount>threshold?'高额分支：通知财务审批人':'标准分支：写入系统记录';
 return <div className="preview-page">
  <header className="preview-header">
   <button className="icon-btn" onClick={()=>nav(`/workflows/${id}`)}><ArrowLeft/></button>
   <div><b>表单预览</b><small>{w.name} · 只读已校验草稿{w.lastValid?` · 校验于 ${w.lastValid.at}`:''}</small></div>
   <span className="spacer"/>
   <span className="readonly-tag"><Lock size={12}/>只读预览</span>
   <button className="secondary" onClick={()=>{setValues({});setSubmitted(false);}}><RotateCcw/>重置</button>
   <button onClick={()=>setSubmitted(true)}>模拟提交</button>
  </header>
  {!snap
    ? <div className="preview-empty"><Lock/><b>当前草稿尚未通过校验</b><p>请回到编辑器运行校验；字段依赖全部有效后，才会生成只读预览快照。</p><button onClick={()=>nav(`/workflows/${id}`)}>返回编辑器</button></div>
    : <div className="preview-stage">
   <section className="form-preview">
    <div className="form-cover"><small>{w.domain} / 申请表单（{fields.length} 个字段 · 已冻结）</small><h1>{form?.data.label||'业务申请'}</h1><p>请完整填写以下信息，带 * 的字段为必填项。字段结构只读，不可在此修改。</p></div>
    <div className="form-body">{fields.map((f:any)=>{
      const set=(v:string)=>setValues(prev=>({...prev,[f.id]:v}));
      return <label key={f.id}>{f.label}{f.required&&<em>*</em>}
       {f.type==='attachment'
        ?<div className="upload"><Lock size={14}/><b>只读字段 · 附件上传占位</b><small>预览沿用校验时快照，不实际上传文件</small></div>
        :f.type==='select'
        ?<select aria-label={f.label} value={values[f.id]||''} onChange={e=>set(e.target.value)}><option value="">请选择</option>{(f.options??[]).map((o:string)=><option key={o}>{o}</option>)}</select>
        :f.type==='text'
        ?<textarea aria-label={f.label} value={values[f.id]||''} onChange={e=>set(e.target.value)} rows={5} placeholder="请输入详细说明（最多 2,000 字）"/>
        :<div className={f.type==='amount'?'money-input':''}>{f.type==='amount'&&<span>¥</span>}<input aria-label={f.label} type={f.type==='amount'||f.type==='number'?'number':f.type==='date'?'date':'text'} value={values[f.id]||''} onChange={e=>set(e.target.value)} placeholder={f.type==='amount'?'0.00':'请输入'}/></div>}
       {submitted&&f.required&&!values[f.id]&&<small className="field-error">此字段为必填项</small>}
      </label>;
     })}
    </div>
   </section>
   <aside className="simulation">
    <h3>条件分支模拟</h3>
    <p>表单字段变化会实时计算流程走向（仅模拟值可输入）。</p>
    <div className="sim-rule"><small>当前规则</small><b>{condition?`${fields.find((f:any)=>f.id===condition.data.config.ruleType)?.label||'申请金额'} > ¥${threshold.toLocaleString()}`:'未配置条件'}</b></div>
    <div className={'sim-result '+(amount>threshold?'high':'normal')} data-testid="branch-result"><small>模拟结果</small><b>{branch}</b><p>当前输入：¥{amount.toLocaleString(undefined,{minimumFractionDigits:2})}</p></div>
    <div className="sim-path"><span className="done">提交申请</span><i>↓</i><span className="done">直属主管审批</span><i>↓</i><span className="active">{amount>threshold?'高额通知':'记录系统'}</span></div>
   </aside>
  </div>}
 </div>;
}
