import * as assert from 'assert';
import { formatPlanStepText, formatPlanForNotification, formatFullPlan, Plan } from '../planUtils';

suite('planUtils Unit Tests', () => {
    suite('formatPlanStepText', () => {
        test('should process valid string steps', () => {
            assert.strictEqual(formatPlanStepText('  Step 1  '), 'Step 1');
            assert.strictEqual(formatPlanStepText(''), null);
            assert.strictEqual(formatPlanStepText('   '), null);
        });

        test('should process object steps with description', () => {
            assert.strictEqual(formatPlanStepText({ description: '  desc  ' }), 'desc');
            assert.strictEqual(formatPlanStepText({ description: '' }), null);
        });

        test('should fallback to title if description is missing or empty', () => {
            assert.strictEqual(formatPlanStepText({ title: '  title  ' }), 'title');
            assert.strictEqual(formatPlanStepText({ title: 'title', description: '' }), 'title');
        });

        test('should return null for invalid object formats', () => {
            assert.strictEqual(formatPlanStepText({ unrelated: 'text' }), null);
            assert.strictEqual(formatPlanStepText(null), null);
            assert.strictEqual(formatPlanStepText(123), null);
            assert.strictEqual(formatPlanStepText([]), null);
        });
    });

    suite('formatPlanForNotification', () => {
        test('should format plan with title and no steps', () => {
            const plan: Plan = { title: 'Test Plan' };
            const result = formatPlanForNotification(plan, 5, 50);
            assert.strictEqual(result, '📋 Test Plan');
        });

        test('should format plan with title and steps', () => {
            const plan: Plan = { title: 'Plan 1', steps: ['Step 1', { description: 'Step 2' }] };
            const result = formatPlanForNotification(plan, 2, 50);
            assert.strictEqual(result, '📋 Plan 1\n1. Step 1\n2. Step 2');
        });

        test('should truncate long steps', () => {
            const plan: Plan = { steps: ['This is a very long step that should be truncated'] };
            const result = formatPlanForNotification(plan, 1, 10);
            assert.strictEqual(result, '1. This is...');
        });

        test('should truncate number of steps', () => {
            const plan: Plan = { steps: ['Step 1', 'Step 2', 'Step 3'] };
            const result = formatPlanForNotification(plan, 2, 50);
            assert.strictEqual(result, '1. Step 1\n2. Step 2\n... and 1 more steps');
        });

        test('should ignore empty steps', () => {
            const plan: Plan = { steps: ['Step 1', '', { title: ' ' }, 'Step 2'] };
            const result = formatPlanForNotification(plan, 5, 50);
            assert.strictEqual(result, '1. Step 1\n2. Step 2');
        });

        test('should clamp maxSteps to 0 and maxStepLength to 4', () => {
            const plan: Plan = { steps: ['Step 1'] };
            const result = formatPlanForNotification(plan, -5, 2);
            assert.strictEqual(result, '');
        });

        test('should handle completely empty plan gracefully', () => {
            const plan: Plan = {};
            const result = formatPlanForNotification(plan, 5, 50);
            assert.strictEqual(result, '');
        });
    });

    suite('formatFullPlan', () => {
        test('should format full plan with session title', () => {
            const plan: Plan = { title: 'Plan Title', steps: ['Step 1', 'Step 2'] };
            const result = formatFullPlan(plan, 'Session Name');

            assert.ok(result.includes('# Plan Review: Session Name'));
            assert.ok(result.includes('## 📋 Plan Title'));
            assert.ok(result.includes('1. Step 1'));
            assert.ok(result.includes('2. Step 2'));
            assert.ok(result.includes('*Use the buttons'));
        });

        test('should format full plan without session title', () => {
            const plan: Plan = { title: 'Plan Title', steps: ['Step 1'] };
            const result = formatFullPlan(plan);
            assert.ok(result.includes('# Plan Review'));
            assert.ok(!result.includes('# Plan Review:'));
        });

        test('should handle empty plan or missing steps', () => {
            const plan: Plan = {};
            const result = formatFullPlan(plan);
            assert.ok(result.includes('*No steps defined in this plan.*'));
        });

        test('should handle all steps being empty or invalid', () => {
            const plan: Plan = { steps: ['', { title: ' ' }] };
            const result = formatFullPlan(plan);
            assert.ok(result.includes('*No steps defined in this plan.*'));
        });
    });
});
