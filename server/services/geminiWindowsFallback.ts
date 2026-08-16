import { spawn } from 'child_process';

/** Windows-only HTTP fallback for environments where the Gemini SDK fetch fails. */
export async function generateGeminiViaWindowsNetwork(apiKey: string, prompt: string, model: string): Promise<string> {
  if (process.platform !== 'win32') throw new Error('Gemini SDK network request failed. Check the server network connection.');
  const requestBody = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } });
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)",
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [Console]::OutputEncoding",
    "$body = [Console]::In.ReadToEnd()",
    "$headers = @{ 'x-goog-api-key' = $env:GEMINI_API_KEY }",
    `$uri = 'https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent'`,
    "$response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 120",
    "$response | ConvertTo-Json -Depth 100 -Compress",
  ].join('; ');
  return new Promise<string>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, GEMINI_API_KEY: apiKey }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code !== 0) return reject(new Error(`Gemini Windows network fallback failed: ${stderr.trim() || `exit code ${code}`}`));
      try {
        const response = JSON.parse(stdout);
        const text = response?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || '').join('').trim();
        if (!text) throw new Error('Gemini returned no text content.');
        resolve(text);
      } catch (error: any) { reject(new Error(`Invalid Gemini fallback response: ${error.message}`)); }
    });
    child.stdin.end(requestBody, 'utf8');
  });
}
