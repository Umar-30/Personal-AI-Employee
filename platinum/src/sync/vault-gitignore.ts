import fs from 'fs';
import path from 'path';

const VAULT_GITIGNORE_CONTENT = `# Secrets and credentials — NEVER sync
.env
.env.*
.env.local
.env.cloud
credentials.*
token.*
*.key
*.pem
*.p12
*.pfx

# OS files
.DS_Store
Thumbs.db
desktop.ini

# Editor files
*.swp
*.swo
*~

# Database files
*.sqlite
*.db

# Node (if vault happens to be in project dir)
node_modules/
`;

export function ensureVaultGitignore(vaultRoot: string): void {
  const gitignorePath = path.join(vaultRoot, '.gitignore');

  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, 'utf-8');
    const requiredPatterns = ['.env', 'credentials.*', 'token.*', '*.key', '*.pem'];
    const missing = requiredPatterns.filter(p => !existing.includes(p));

    if (missing.length > 0) {
      const append = '\n# Added by Platinum sync\n' + missing.map(p => p).join('\n') + '\n';
      fs.appendFileSync(gitignorePath, append);
    }
    return;
  }

  fs.writeFileSync(gitignorePath, VAULT_GITIGNORE_CONTENT, 'utf-8');
}
