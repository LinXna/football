import { updateJsonFile } from '../server/jsonStore';

const filePath = process.argv[2];
const iterations = Number(process.argv[3] || 1);
if (!filePath || !Number.isInteger(iterations) || iterations < 1) process.exit(2);

for (let index = 0; index < iterations; index++) {
  updateJsonFile<{ count: number }>(filePath, { count: 0 }, (current) => ({ count: Number(current.count || 0) + 1 }));
}
