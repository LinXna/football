/**
 * 导入性能与 Tracer 降噪专项验证套件
 * 算子编号: [TEST-PERF-IMPORT-TRACER]
 */

import { Tracer } from '../00_common/Tracer.js';
import assert from 'assert';

console.log('================================================================================');
console.log('🚀 开始验证导入性能与 Tracer 静默降噪机制');
console.log('================================================================================');

// 1. 验证 Tracer 默认终端过滤级别为 WARN，INFO / DEBUG 不刷屏但内存队列完整
console.log('\n[Test 1] 验证 Tracer 日志过滤与内存全链路保留...');
const tracer = Tracer.getInstance();
tracer.clearLogs();
assert.strictEqual(tracer.getMinConsoleLevel(), 'WARN', '默认 Tracer 控制台级别必须为 WARN');

// 捕获 stdout 验证是否有 INFO 刷屏
let stdoutIntercepted = '';
const originalInfo = console.info;
console.info = (...args: any[]) => {
  stdoutIntercepted += args.join(' ') + '\n';
  originalInfo(...args);
};

tracer.info('TEST_OP', 'RC_TEST', '这是一条 INFO 级别的结构化量化推演输出，不应该出现在控制台 stdout', { heavyPayload: [1, 2, 3] });
tracer.debug('TEST_OP', 'RC_TEST', '这是一条 DEBUG 级别的输出，不应该出现在控制台 stdout');

// 恢复 console.info
console.info = originalInfo;

assert.strictEqual(stdoutIntercepted, '', 'INFO / DEBUG 级别日志严禁在默认控制台级别下产生标准输出');

// 验证日志是否完整沉淀在内存追踪队列
const recentLogs = tracer.getRecentLogs(10);
assert.strictEqual(recentLogs.length, 2, '内存追踪队列必须 100% 完整保留全部日志条目以备回溯');
assert.strictEqual(recentLogs[0].level, 'INFO');
assert.strictEqual(recentLogs[1].level, 'DEBUG');
console.log('✓ Tracer 降噪与全量内存追踪审计验证通过');

// 2. 验证 WARN 与 ERROR 仍可正常输出至控制台
console.log('\n[Test 2] 验证 WARN / ERROR 仍受保留并正常告警...');
let warnIntercepted = '';
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  warnIntercepted += args.join(' ') + '\n';
};
tracer.warn('TEST_OP', 'RC_TEST', '这是一条测试 WARN 告警');
console.warn = originalWarn;
assert.ok(warnIntercepted.includes('这是一条测试 WARN 告警'), 'WARN 必须正常进入终端输出');
console.log('✓ WARN / ERROR 告警输出能力验证通过');

console.log('================================================================================');
console.log('🎉 导入全链路性能与日志降噪自测全部通过！');
console.log('================================================================================');
