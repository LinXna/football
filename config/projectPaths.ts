import path from 'path';

/** Absolute project root, independent of whether the server is started from dist/. */
export const PROJECT_ROOT = process.env.PROJECT_ROOT
  ? path.resolve(process.env.PROJECT_ROOT)
  : process.cwd();

export const resolveProjectPath = (filePath: string): string =>
  path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);

export const projectPath = (...segments: string[]): string =>
  path.join(PROJECT_ROOT, ...segments);
