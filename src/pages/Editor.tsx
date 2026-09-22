import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,CheckCircle2,ChevronDown,Eye,FileClock,GitBranch,Link2,Play,Plus,Save,Send,Trash2,XCircle} from 'lucide-react';
import {FlowCanvas} from '../components/FlowCanvas';
import {useAppStore} from '../store/useAppStore';
import {FIELD_TYPES,collectFields} from '../services/flowDomain';
import type {FieldType,FlowNode,FormField,NodeKind} from '../types';

const palette:[NodeKind,string,string][]=[['start','开始','流程入口'],['form','表单填写','收集业务数据'],['approval','审批','人工审批任务'],['condition','条件分支','按规则分流'],['automation','自动化','执行本地动作'],['notify','通知','发送站内通知'],['end','结束','流程终点']];
const slug=(s:string)=>s.trim().toLowerCase().replace(/[^a-z0-9一-龥]+/g,'').slice(0,16)||'field';
const newFieldId=(used:Set<string>)=>{let id='fld-'+Math.random().toString(36).slice(2,8);while(used.has(id))id='fld-'+Math.random().toString(36).slice(2,8);return id;};

export function Editor(){
 const {id}=useParams(),nav=useNavigate();
 const store=useAppStore();
 const w=store.workflows.find(x=>x.id===store.currentId)||store.workflows[0];
 const selected=w.nodes.find(n=>n.id===store.selectedNodeId);
 useEffect(()=>{if(id&&id!==store.currentId)store.setCurrent(id)},[id]);
 const add=(type:NodeKind)=>{
  const node:FlowNode={id:type+'-'+Date.now(),type,position:{x:350+Math.random()*200,y:200+Math.random()*150},data:{label:palette.find(x=>x[0]===type)![1],state:'unconfigured',config:type==='form'?{fields:[]}:{}}};
  store.updateNodes([...w.nodes,node]);
 };
 const publish=()=>{store.runValidation();store.publish();};
 return <div className="editor-page">
  <div className="editor-top">
   <button className="icon-btn" onClick={()=>nav('/workflows')}><ArrowLeft/></button>
   <div className="editor-title"><small>流程管理 / {w.domain}</small><b>{w.name}</b></div>
   <span className={'draft-indicator '+(w.status==='draft'?'':'published')}>{w.status==='draft'?'● 草稿':'✓ 已发布'} · v{w.version}</span>
   <div className="editor-actions">
    <button className="secondary" onClick={store.save}><Save/>保存草稿</button>
    <button className="secondary" data-testid="validate-button" onClick={store.runValidation}><Play/>运行校验</button>
    <button className="secondary" onClick={()=>nav(`/workflows/${w.id}/preview`)}><Eye/>预览</button>
    <button className="secondary" onClick={()=>nav(`/workflows/${w.id}/versions`)}><FileClock/>版本历史</button>
    <button data-testid="publish-button" onClick={publish}><Send/>发布</button>
   </div>
  </div>
  <div className="editor-body">
   <aside className="node-library">
    <div className="pane-title"><b>节点组件</b><small>点击添加到画布</small></div>
    <div className="node-search">搜索节点组件</div>
    <h4>基础节点</h4>
    {palette.map(([type,label,desc])=><button key={type} className={'palette '+type} onClick={()=>add(type)}><span>+</span><div><b>{label}</b><small>{desc}</small></div></button>)}
    <div className="library-tip"><b>使用提示</b><p>表单字段改名/改类型会同步条件依赖；字段删除后引用节点停在“待修复”，修复前整批拒绝发布。</p></div>
   </aside>
   <section className="editor-center">
    <div className="canvas-bar"><span>主流程</span><span className="spacer"/><button className="icon-btn">−</button><small>100%</small><button className="icon-btn">＋</button></div>
    {w.nodes.length
      ?<FlowCanvas nodes={w.nodes} edges={w.edges} onNodes={store.updateNodes} onEdges={store.updateEdges} onSelect={store.selectNode}/>
      :<div className="blank-flow"><div>⌘</div><b>从一个开始节点构建流程</b><p>在左侧点击节点组件，将它添加到画布。</p><button onClick={()=>add('start')}><Plus/>添加开始节点</button></div>}
   </section>
   <ConfigPanel node={selected} update={store.updateConfig}/>
  </div>
  <section className="issues" data-testid="issues-panel">
   <div className="issues-head"><b>问题面板</b><span className="error-count" data-testid="error-count">{store.issues.filter(i=>i.level==='error').length} 错误</span><span>{store.issues.filter(i=>i.level==='warning').length} 警告</span><span className="spacer"/><small>上次校验：刚刚</small><ChevronDown/></div>
   {store.issues.length>0&&<div className="issue-list">{store.issues.map((i,k)=><button key={i.nodeId+'-'+k} onClick={()=>store.selectNode(i.nodeId)}><XCircle/><b>{i.message}</b><small>节点：{w.nodes.find(n=>n.id===i.nodeId)?.data.label||'流程'}</small><span>定位 →</span></button>)}</div>}
  </section>
  <PublishReject rows={store.rejectRows} onClose={store.dismissReject}/>
 </div>;
}

/** 发布整批拒绝报告：流程 / 字段 / 节点 / 旧值 / 新值 */
function PublishReject({rows,onClose}:{rows:ReturnType<typeof useAppStore.getState>['rejectRows'];onClose:()=>void}){
 if(!rows||!rows.length)return null;
 return <div className="drawer-backdrop" data-testid="publish-reject">
  <aside className="reject-panel">
   <div className="drawer-head"><div><small>发布门禁</small><h2>发布被拒绝：整批未发布</h2></div><button className="icon-btn" onClick={onClose}><XCircle/></button></div>
   <p className="reject-hint">下列字段依赖问题必须全部修复后才能发布。每行包含流程、字段、节点与旧/新值。</p>
   <div className="reject-table-wrap">
    <table className="reject-table" data-testid="reject-table">
     <thead><tr><th>流程</th><th>字段</th><th>节点</th><th>问题</th><th>旧值</th><th>新值</th></tr></thead>
     <tbody>{rows.map((r,k)=><tr key={k} data-testid="reject-row">
      <td><b>{r.workflowName}</b><small>{r.workflowId}</small></td>
      <td><b>{r.fieldLabel}</b><small>{r.fieldId}</small></td>
      <td><b>{r.nodeLabel}</b><small>{r.nodeId}</small></td>
      <td><span className={'reject-reason '+(r.fieldId!=='—'?'dep':'struc')}>{r.reason}</span></td>
      <td className="old-val">{r.oldValue}</td>
      <td className="new-val">{r.newValue}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <div className="reject-foot"><button onClick={onClose}>返回修复</button></div>
  </aside>
 </div>;
}

function ConfigPanel({node,update}:{node?:FlowNode;update:(id:string,c:Record<string,any>)=>void}){
 const store=useAppStore();
 const [saved,setSaved]=useState(false);
 useEffect(()=>setSaved(false),[node?.id]);
 if(!node)return <aside className="config-panel empty-config"><div>◫</div><b>选择一个节点</b><p>在画布中选择节点以查看和编辑配置。</p></aside>;
 const c=node.data.config;
 const set=(v:Record<string,any>)=>{update(node.id,v);setSaved(false);};
 const save=()=>setSaved(true);
 return <aside className="config-panel" data-testid="config-panel">
  <div className="config-head"><div><small>{node.type.toUpperCase()} NODE</small><h3>{node.data.label}</h3>{node.data.state==='pendingFix'&&<span className="pending-badge" data-testid="pending-badge"><GitBranch size={11}/>待修复</span>}</div><button className="icon-btn" title="删除节点（演示中禁用）"><Trash2/></button></div>
  <label>节点名称<input value={node.data.label} readOnly/></label>
  {node.type==='approval'&&<><h4>审批配置</h4>
   <label>审批人来源<select aria-label="审批人来源" value={c.approverSource||''} onChange={e=>set({approverSource:e.target.value})}><option value="">请选择审批人来源</option><option>直属主管</option><option>固定角色</option><option>指定成员</option><option>表单字段</option></select></label>
   {c.approverSource==='固定角色'&&<label>审批角色<select onChange={e=>set({role:e.target.value})}><option>财务审批人</option><option>部门负责人</option><option>法务经理</option></select></label>}
   <label>审批说明<textarea rows={5} value={c.instruction||''} onChange={e=>set({instruction:e.target.value})} placeholder="输入审批说明"/></label>
  </>}
  {node.type==='condition'&&<ConditionEditor node={node}/>}
  {node.type==='form'&&<FormFieldEditor node={node}/>}
  {node.type==='automation'&&<><h4>本地动作</h4><label>执行动作<select value={c.action||''} onChange={e=>set({action:e.target.value})}><option>创建工单</option><option>发送 Webhook（模拟）</option><option>写入系统记录</option></select></label></>}
  {node.type==='notify'&&<><h4>通知设置</h4><label>通知对象<input value={c.targets||''} onChange={e=>set({targets:e.target.value})}/></label><label>消息模板<textarea value={c.template||''} onChange={e=>set({template:e.target.value})}/></label></>}
  <div className="config-footer"><span>{saved?<><CheckCircle2/>配置已保存</>:'尚有未保存更改'}</span><button data-testid="save-node-config" onClick={save}>保存配置</button></div>
 </aside>;
}

/** 条件节点配置：正常态选择字段；失效态展示旧值/新值并引导修复 */
function ConditionEditor({node}:{node:FlowNode}){
 const store=useAppStore();
 const w=store.workflows.find(x=>x.id===store.currentId)!;
 const fields=collectFields(w);
 const c=node.data.config,b=c.brokenRef;
 const set=(patch:Record<string,any>)=>store.updateConfig(node.id,patch);
 const choose=(fieldId:string)=>{
  if(node.data.state==='pendingFix'||b)store.fixCondition(node.id,fieldId);
  else set({ruleType:fieldId});
 };
 const current=c.ruleType||'';
 return <>
  <h4>分支规则</h4>
  {b&&<div className="broken-card" data-testid="broken-card">
   <div><GitBranch/><b>字段依赖失效 · 待修复</b></div>
   <p>该节点引用的字段已不可用，发布将被整批拒绝。</p>
   <dl>
    <div><dt>字段</dt><dd>{b.fieldLabel}（{b.fieldId}）</dd></div>
    <div><dt>旧值</dt><dd data-testid="broken-old">{b.reason==='removed'?`${b.oldType} · 引用中`:`字段类型：${b.oldType}`}</dd></div>
    <div><dt>新值</dt><dd data-testid="broken-new">{b.reason==='removed'?'字段已删除':`字段类型：${b.newType}`}</dd></div>
    <div><dt>发生时间</dt><dd>{b.since}</dd></div>
   </dl>
  </div>}
  <label>判断字段
   <select aria-label="条件字段" value={current} onChange={e=>choose(e.target.value)} className={b?'select-broken':''}>
    {b&&<option value="">请重新选择字段以修复</option>}
    {!b&&<option value="">请选择字段</option>}
    {fields.map(f=><option key={f.id} value={f.id}>{f.label} · {f.type}</option>)}
   </select>
  </label>
  {current&&<div className="form-row">
   <label>运算符<select value={c.operator||'>'} onChange={e=>set({operator:e.target.value})}><option>&gt;</option><option>=</option><option>为空</option></select></label>
   <label>比较值<input aria-label="条件比较值" type="number" value={c.value||''} onChange={e=>set({value:Number(e.target.value)})}/></label>
  </div>}
  <div className="branch-card"><b>分支 1</b><span>满足规则</span></div>
  <div className="branch-card"><b>分支 2</b><span>其他情况</span></div>
 </>;
}

/** 表单字段审校台：增删改即时同步依赖，并展示每个字段被哪些条件节点引用 */
function FormFieldEditor({node}:{node:FlowNode}){
 const store=useAppStore();
 const w=store.workflows.find(x=>x.id===store.currentId)!;
 const fields=(node.data.config.fields??[]) as FormField[];
 const used=new Set(fields.map(f=>f.id));
 const refsOf=(fid:string)=>w.nodes.filter(n=>n.type==='condition'&&(n.data.config.ruleType===fid||n.data.config.brokenRef?.fieldId===fid));
 const add=()=>store.addField(node.id,{label:'新字段',type:'text',required:false});
 return <>
  <h4>表单字段 <button className="add-field" data-testid="add-field" onClick={add}><Plus size={12}/>新增字段</button></h4>
  {fields.length===0&&<p className="no-field">还没有字段，新增字段后条件节点即可引用。</p>}
  {fields.map((f,idx)=>{
   const refs=refsOf(f.id);
   return <div key={f.id} className={'field-editor '+(refs.some(r=>r.data.config.brokenRef)?'is-broken':'')} data-testid={'field-row-'+f.id}>
    <div className="field-row-head"><b>{f.label||'未命名字段'}</b><button className="icon-btn field-del" data-testid={'remove-field-'+f.id} title="删除字段" onClick={()=>store.removeField(node.id,f.id)}><Trash2 size={13}/></button></div>
    <label>字段标识（名称）
     <input aria-label={`字段名称-${idx}`} data-testid={'field-label-'+f.id} value={f.label} onChange={e=>store.updateField(node.id,f.id,{label:e.target.value||slug('field')})}/>
    </label>
    <label>字段类型
     <select aria-label={`字段类型-${idx}`} data-testid={'field-type-'+f.id} value={f.type} onChange={e=>store.updateField(node.id,f.id,{type:e.target.value as FieldType})}>
      {FIELD_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
     </select>
    </label>
    <label className="field-required"><input type="checkbox" checked={f.required} onChange={e=>store.updateField(node.id,f.id,{required:e.target.checked})}/>必填字段</label>
    <div className="field-refs" data-testid={'field-refs-'+f.id}>
     <Link2 size={11}/>{refs.length
      ? refs.map(r=><span key={r.id} className={r.data.config.brokenRef?'ref-broken':'ref-ok'}>{r.data.config.brokenRef?'待修复：':'条件节点：'}{r.data.label}</span>)
      : <span className="ref-none">暂无节点引用</span>}
    </div>
   </div>;
  })}
 </>;
}
