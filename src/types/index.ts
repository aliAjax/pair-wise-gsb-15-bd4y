export type WorkflowStatus='draft'|'published'|'archived';
export type NodeKind='start'|'form'|'approval'|'condition'|'automation'|'notify'|'end';
export type NodeState='unconfigured'|'configuring'|'valid'|'invalid'|'pending';
export type FieldType='text'|'number'|'amount'|'date'|'select'|'attachment';
export interface FormField {id:string;label:string;type:FieldType;required:boolean;options?:string[]}
export interface FieldImpact {workflowId:string;workflowName:string;nodeId:string;nodeLabel:string;fieldId:string;fieldLabel:string;kind:'removed'|'type-changed';oldValue:string;newValue:string}
export interface FlowNode {id:string;type:NodeKind;position:{x:number;y:number};data:{label:string;state:NodeState;config:Record<string,any>}}
export interface FlowEdge {id:string;source:string;target:string;label?:string}
export interface Version {version:number;createdAt:string;note:string;nodes:FlowNode[];edges:FlowEdge[];fields?:FormField[]}
export interface Workflow {id:string;name:string;domain:string;status:WorkflowStatus;version:number;editor:string;updatedAt:string;publishedAt?:string;abnormalCount:number;nodes:FlowNode[];edges:FlowEdge[];versions:Version[]}
export interface Instance {id:string;workflowId:string;applicant:string;domain:string;currentNode:string;status:'abnormal'|'timeout'|'running'|'completed';submittedAt:string;duration:string;risk:'high'|'medium'|'low';timeline:{title:string;time:string;status:string}[]}
export interface ValidationIssue {nodeId:string;level:'error'|'warning';message:string}
export interface PublishRejection {workflowId:string;workflowName:string;impacts:FieldImpact[];issues:ValidationIssue[]}
