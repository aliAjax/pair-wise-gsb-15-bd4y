import {test,expect} from '@playwright/test';

/** 每个用例从干净的种子数据开始，避免本地持久化互相污染 */
test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.removeItem('flowdesk.state.v2'));
 await page.reload();
});

const openForm=async(page:any)=>{
 await page.goto('/workflows/wf-2');
 await page.getByTestId('canvas-node-form').click();
 await expect(page.getByTestId('config-panel')).toContainText('表单字段');
};

test.describe.serial('表单字段依赖审校台',()=>{
 test('字段改标识后条件节点依赖自动跟随',async({page})=>{
  await openForm(page);
  // 金额判断引用 amount，字段面板应展示被引用状态
  await expect(page.getByTestId('field-refs-amount')).toContainText('金额判断');
  await page.getByTestId('field-label-amount').fill('费用总额');
  await page.getByTestId('canvas-node-condition').click();
  await expect(page.getByLabel('条件字段')).toHaveValue('amount');
  await page.getByTestId('validate-button').click();
  await expect(page.getByTestId('error-count')).toContainText('0 错误');
 });

 test('字段改类型让引用条件停在待修复，校验报错',async({page})=>{
  await openForm(page);
  await page.getByTestId('field-type-amount').selectOption('text');
  await page.getByTestId('canvas-node-condition').click();
  await expect(page.getByTestId('pending-badge')).toBeVisible();
  await expect(page.getByTestId('broken-card')).toContainText('待修复');
  await expect(page.getByTestId('broken-old')).toContainText('amount');
  await expect(page.getByTestId('broken-new')).toContainText('text');
  await expect(page.getByTestId('canvas-node-condition')).toHaveClass(/pendingFix/);
  await page.getByTestId('validate-button').click();
  await expect(page.getByTestId('error-count')).toContainText('1 错误');
  await expect(page.getByTestId('issues-panel')).toContainText('类型由 amount 改为 text');
 });

 test('删除字段后发布被整批拒绝，报告列出流程/字段/节点/旧值/新值',async({page})=>{
  await openForm(page);
  await page.getByTestId('remove-field-amount').click();
  await page.getByTestId('publish-button').click();
  const panel=page.getByTestId('publish-reject');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('发布被拒绝');
  await expect(panel).toContainText('整批未发布');
  const row=page.getByTestId('reject-row');
  await expect(row).toContainText('采购合同审批');      // 流程
  await expect(row).toContainText('申请金额');          // 字段
  await expect(row).toContainText('金额判断');          // 节点
  await expect(row).toContainText('字段被移除');        // 问题
  await expect(row.locator('.old-val')).toContainText('amount');
  await expect(row.locator('.new-val')).toContainText('已删除');
  // 工作流列表仍为 v2 草稿/已发布原状，未产生新版本
  await page.goto('/workflows');
  const wfRow=page.getByTestId('workflow-row').filter({hasText:'采购合同审批'});
  await expect(wfRow).toContainText('v2');
 });

 test('重新选择字段修复后可成功发布并冻结新快照',async({page})=>{
  await openForm(page);
  // 先新增一个可比较字段作为修复目标
  await page.getByTestId('add-field').click();
  const newRow=page.getByTestId(/field-row-fld-/).last();
  await newRow.getByLabel(/字段名称-/).fill('预算额度');
  await newRow.getByLabel(/字段类型-/).selectOption('number');
  // 金额改类型导致条件待修复
  await page.getByTestId('field-type-amount').selectOption('text');
  await page.getByTestId('canvas-node-condition').click();
  await expect(page.getByTestId('pending-badge')).toBeVisible();
  await expect(page.getByTestId('publish-button')).toBeVisible();
  await page.getByTestId('publish-button').click();
  await expect(page.getByTestId('publish-reject')).toBeVisible();
  await page.getByRole('button',{name:'返回修复'}).click();
  // 在条件节点上重新选择有效字段，离开待修复
  await page.getByLabel('条件字段').selectOption({label:'预算额度 · number'});
  await expect(page.getByTestId('pending-badge')).toHaveCount(0);
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  await page.goto('/workflows/wf-2/versions');
  await expect(page.getByTestId('snap-fields-3')).toContainText('预算额度 · number');
 });

 test('新增字段即时进入条件字段列表与引用关系',async({page})=>{
  await openForm(page);
  await page.getByTestId('add-field').click();
  const rows=page.getByTestId(/field-row-fld-/);
  await expect(rows.last()).toBeVisible();
  await rows.last().getByLabel(/字段名称-/).fill('差旅天数');
  await rows.last().getByLabel(/字段类型-/).selectOption('number');
  await page.getByTestId('canvas-node-condition').click();
  const opts=page.getByLabel('条件字段').locator('option');
  await expect(opts.filter({hasText:'差旅天数'})).toHaveCount(1);
 });

 test('预览只读已校验草稿：坏草稿仍显示校验时字段',async({page})=>{
  // wf-2 已校验；预览直接可见
  await page.goto('/workflows/wf-2/preview');
  await expect(page.getByText('只读已校验草稿')).toBeVisible();
  await expect(page.getByLabel('申请金额')).toBeVisible();
  // 从未通过校验的新流程没有可预览快照
  await page.goto('/workflows');
  await page.getByRole('button',{name:'新建流程'}).click();
  await expect(page).toHaveURL(/\/workflows\/wf-/);
  await page.getByRole('button',{name:'预览'}).click();
  await expect(page.getByText('当前草稿尚未通过校验')).toBeVisible();
 });

 test('实例详情只展示发布快照字段，不展示草稿新增字段',async({page})=>{
  await page.goto('/monitor?instance=INS-2026-0002'); // wf-2 实例
  await expect(page.getByTestId('instance-detail')).toBeVisible();
  await expect(page.getByTestId('snapshot-note')).toContainText('字段快照');
  await expect(page.getByTestId('instance-field-amount')).toBeVisible();
  await expect(page.getByTestId('instance-field-costCenter')).toHaveCount(0);
 });

 test('刷新后草稿、待修复依赖、发布快照保持一致',async({page})=>{
  await openForm(page);
  await page.getByTestId('field-type-amount').selectOption('text');
  await page.getByTestId('save-node-config').click();
  await page.reload();
  await expect(page.getByTestId('canvas-node-condition')).toHaveClass(/pendingFix/);
  await page.getByTestId('canvas-node-condition').click();
  await expect(page.getByTestId('broken-old')).toContainText('amount');
  await expect(page.getByTestId('broken-new')).toContainText('text');
  // 快照字段不受草稿变更影响
  await page.goto('/monitor?instance=INS-2026-0002');
  await expect(page.getByTestId('instance-detail')).toBeVisible();
  await expect(page.getByTestId('instance-field-amount')).toBeVisible();
  await expect(page.getByTestId('instance-field-costCenter')).toHaveCount(0);
 });
});
