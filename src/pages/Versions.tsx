import {useMemo,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,GitCompare,History,RotateCcw} from 'lucide-react';
import {PageTitle} from '../components/common';
import {useAppStore} from '../store/useAppStore';
import type {Version} from '../types';

const snapFields=(v?:Version)=>v?.fieldSnapshot?.fields??[];

export function Versions(){
 const {id}=useParams(),nav=useNavigate(),store=useAppStore();
 const w=store.workflows.find(x=>x.id===id)!;
 const all=[...w.versions].sort((a,b)=>b.version-a.version);
 const [left,setLeft]=useState(all.at(-1)?.version||1),[right,setRight]=useState(all[0]?.version||w.version);
 const a=all.find(v=>v.version===left),b=all.find(v=>v.version===right);
 const diff=useMemo(()=>{
  if(!a||!b)return {added:[],removed:[],changed:[],fieldsAdded:[],fieldsRemoved:[]};
  const af=new Map(snapFields(a).map(f=>[f.id,f])),bf=new Map(snapFields(b).map(f=>[f.id,f]));
  return {
   added:b.nodes.filter(n=>!a.nodes.some(x=>x.id===n.id)),
   removed:a.nodes.filter(n=>!b.nodes.some(x=>x.id===n.id)),
   changed:b.nodes.filter(n=>{const old=a.nodes.find(x=>x.id===n.id);return old&&JSON.stringify(old.data.config)!==JSON.stringify(n.data.config)}),
   fieldsAdded:snapFields(b).filter(f=>!af.has(f.id)),
   fieldsRemoved:snapFields(a).filter(f=>!bf.has(f.id)),
  };
 },[a,b]);
 const restore=()=>{store.setCurrent(w.id);store.restore(left);nav(`/workflows/${w.id}`)};
 return <div className="page versions-page">
  <button className="back-link" onClick={()=>nav(`/workflows/${id}`)}><ArrowLeft/>返回编辑器</button>
  <PageTitle eyebrow="流程版本" title="Version History" desc={`${w.name} · 已发布版本沿用发布时冻结的表单字段快照，可比较结构差异或恢复历史版本。`}/>
  <div className="version-layout">
   <aside className="panel version-list">
    <h3><History/>版本记录</h3>
    {all.map((v,i)=>{const fs=snapFields(v);return <button key={v.version} className={v.version===right?'active':''} onClick={()=>setRight(v.version)}>
     <span><b>v{v.version}</b>{i===0&&<em>当前</em>}</span>
     <small>{v.createdAt}</small>
     <p>{v.note}</p>
     <div className="snap-chips" data-testid={'snap-fields-'+v.version}>{fs.length?fs.map(f=><em key={f.id} title={`${f.label} · ${f.type}`}>{f.label} · {f.type}</em>):<em className="no-snap">无字段快照</em>}</div>
    </button>;})}
   </aside>
   <section className="panel compare" data-testid="version-compare">
    <div className="compare-head"><div><GitCompare/><h2>版本对比</h2></div><button className="secondary" data-testid="restore-version" onClick={restore}><RotateCcw/>恢复 v{left} 为草稿</button></div>
    <div className="compare-select">
     <label>基准版本<select value={left} onChange={e=>setLeft(Number(e.target.value))}>{all.map(v=><option key={v.version} value={v.version}>v{v.version} · {v.createdAt}</option>)}</select></label>
     <span>→</span>
     <label>比较版本<select value={right} onChange={e=>setRight(Number(e.target.value))}>{all.map(v=><option key={v.version} value={v.version}>v{v.version} · {v.createdAt}</option>)}</select></label>
    </div>
    <div className="diff-summary"><article><small>新增节点</small><b>{diff.added.length}</b></article><article><small>删除节点</small><b>{diff.removed.length}</b></article><article><small>配置变化</small><b>{diff.changed.length}</b></article><article><small>字段快照差异</small><b data-testid="field-diff-count">{diff.fieldsAdded.length+diff.fieldsRemoved.length}</b></article></div>
    <div className="diff-list">
     <h3>变更明细</h3>
     {diff.added.map(n=><div key={n.id} className="diff added"><span>＋ 新增</span><b>{n.data.label}</b><small>{n.type} 节点</small></div>)}
     {diff.removed.map(n=><div key={n.id} className="diff removed"><span>− 删除</span><b>{n.data.label}</b><small>{n.type} 节点</small></div>)}
     {diff.fieldsAdded.map(f=><div key={'fa-'+f.id} className="diff added"><span>＋ 字段</span><b>{f.label}</b><small>{f.id} · {f.type}</small></div>)}
     {diff.fieldsRemoved.map(f=><div key={'fr-'+f.id} className="diff removed"><span>− 字段</span><b>{f.label}</b><small>{f.id} · {f.type}</small></div>)}
     {diff.changed.map(n=><div key={n.id} className="diff changed"><span>~ 配置</span><b>{n.data.label}</b><small>节点配置已更新</small></div>)}
     {!diff.added.length&&!diff.removed.length&&!diff.changed.length&&!diff.fieldsAdded.length&&!diff.fieldsRemoved.length&&<div className="empty-diff">这两个版本的节点结构与字段快照一致</div>}
     <div className="release-note"><small>发布说明</small><p>{b?.note}</p><small style={{display:'block',marginTop:8}}>字段快照（{snapFields(b).length}）：{snapFields(b).map(f=>f.label).join('、')||'无'}</small></div>
    </div>
   </section>
  </div>
 </div>;}
