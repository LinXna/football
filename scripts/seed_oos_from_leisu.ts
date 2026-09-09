/**
 * @file seed_oos_from_leisu.ts
 * @description 一键从雷速历史数据编译并生成 OOS 校准档案 (refactor/runtime/oos_calibration_archive.json)
 * 用法: npx tsx scripts/seed_oos_from_leisu.ts [可选的额外雷速json路径]
 */

import fs from 'fs';
import path from 'path';
import { buildOosArchiveFromLeisu } from '../refactor/06_settlement_audit/leisuHistoricalSeeder.js';

function main() {
  console.log('🚀 开始执行雷速历史 OOS 样本校准档案冷启动编译...');

  const payloads: any[] = [];
  const searchDirs = [
    path.resolve('refactor/fixtures')
  ];

  // 1. 收集所有雷速 JSON 文件
  const candidateFiles: string[] = [];

  // 检查命令行传入的文件
  const cliArgs = process.argv.slice(2);
  for (const arg of cliArgs) {
    if (fs.existsSync(arg)) {
      candidateFiles.push(path.resolve(arg));
    }
  }

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith('leisu') && f.endsWith('.json')) {
        candidateFiles.push(path.join(dir, f));
      }
    }
  }

  const uniqueFiles = Array.from(new Set(candidateFiles));
  console.log(`🔍 扫描到 ${uniqueFiles.length} 个雷速数据源文件:`);
  for (const file of uniqueFiles) {
    console.log(`   - ${path.relative(process.cwd(), file)}`);
    try {
      const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      payloads.push(content);
    } catch (err: any) {
      console.warn(`   ⚠️ 读取解析失败: ${file}: ${err?.message}`);
    }
  }

  if (payloads.length === 0) {
    console.error('❌ 未找到任何可用的雷速数据源文件！');
    process.exit(1);
  }

  // 2. 编译档案
  const { archive, samples } = buildOosArchiveFromLeisu(payloads, {
    model_version: 'layer03-v1',
    generated_at: new Date().toISOString()
  });

  // 3. 写入 refactor/runtime 目录
  const outputDir = path.join(process.cwd(), 'refactor', 'runtime');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const archivePath = path.join(outputDir, 'oos_calibration_archive.json');
  fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2), 'utf-8');

  const samplesPath = path.join(outputDir, 'oos_calibration_samples.json');
  fs.writeFileSync(samplesPath, JSON.stringify(samples, null, 2), 'utf-8');

  console.log('✅ OOS 校准档案成功编译并落盘至重构运行时目录！');
  console.log(`   - 归档文件路径: ${path.relative(process.cwd(), archivePath)}`);
  console.log(`   - 样本明细路径: ${path.relative(process.cwd(), samplesPath)}`);
  console.log(`   - 有效样本总量: ${samples.length} 条`);
  console.log(`   - 全局有效样本量 (ESS): ${archive.global_profile.effective_sample_size}`);
  console.log(`   - 校准分桶总量: ${archive.profiles.length} 个`);
  console.log(`   - 全局 Brier Score: ${archive.global_profile.oos_brier_score}`);
  console.log(`   - 门禁状态: ${archive.global_profile.status}`);
}

main();
