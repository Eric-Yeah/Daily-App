// The repository and the published site are PUBLIC. This check fails if a tracked file
// contains a secret, a real e-mail address or a local machine path/name.
// Run: npm run check:public   (also runs in GitHub Actions before every deploy)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !/\.(png|jpg|jpeg|gif|webp|ico|woff2?|pdf)$/i.test(f) && f !== 'package-lock.json');

const RULES = [
  ['Supabase-Secret-Key', /sb_secret_[A-Za-z0-9_-]{8,}/],
  ['Anthropic-Key', /sk-ant-[A-Za-z0-9_-]{8,}/],
  ['Groq-Key', /gsk_[A-Za-z0-9]{10,}/],
  ['GitHub-Token', /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['Google-Key', /AIza[0-9A-Za-z_-]{30,}/],
  ['AWS-Key', /AKIA[0-9A-Z]{16}/],
  ['Private Key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Datenbank-URL', /postgres(?:ql)?:\/\/[^\s'"`]*@/],
  ['Lokaler Pfad', /\/Users\/[A-Za-z0-9._-]+\//],
  ['Rechnername', /MacBook-[A-Za-z0-9-]+|[A-Za-z0-9-]+\.local\b(?!Storage)/],
];

// E-mail addresses: only obvious placeholders are allowed.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_OK = /@(example\.(com|org|de)|beispiel\.de|users\.noreply\.github\.com|anthropic\.com)$/i;

// JWTs are fine only as public "anon" keys; a service_role JWT is a secret.
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

const problems = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    for (const [name, re] of RULES) if (re.test(line)) problems.push(`${where}  ${name}`);
    for (const m of line.match(EMAIL) ?? []) if (!EMAIL_OK.test(m)) problems.push(`${where}  E-Mail-Adresse`);
    for (const m of line.match(JWT) ?? []) {
      try {
        const payload = JSON.parse(Buffer.from(m.split('.')[1], 'base64url').toString('utf8'));
        if (payload.role !== 'anon') problems.push(`${where}  JWT mit Rolle "${payload.role}"`);
      } catch {
        problems.push(`${where}  unlesbarer JWT`);
      }
    }
  });
}

if (problems.length) {
  console.error('Nicht veröffentlichen, das Repository ist öffentlich:\n' + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}
console.log(`check:public ok (${files.length} Dateien geprüft)`);
