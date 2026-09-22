import type {Instance,Workflow} from '../types';
import {clone} from './flowDomain';

/** 本地持久化：刷新后草稿、依赖、发布快照与实例保持一致。数据层独立，不依赖 UI/规则层。 */
const KEY='flowdesk.state.v2';
export interface Persisted{workflows:Workflow[];instances:Instance[]}

export function loadState():Persisted|null{
 try{
  const raw=localStorage.getItem(KEY);
  if(!raw)return null;
  const data=JSON.parse(raw) as Persisted;
  if(!Array.isArray(data.workflows)||!Array.isArray(data.instances))return null;
  return data;
 }catch{return null;}
}
export function saveState(state:Persisted){
 try{localStorage.setItem(KEY,JSON.stringify(state));}catch{/* 存储不可用时静默降级到内存态 */}
}
export const hydrate=(seed:Persisted):Persisted=>loadState()??clone(seed);
export const resetState=()=>{try{localStorage.removeItem(KEY);}catch{/* ignore */}};
