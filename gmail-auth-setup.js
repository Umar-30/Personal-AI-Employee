/**
 * Gmail OAuth2 Token Generator
 * Run once to generate token.json for Gmail MCP
 */
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

async function main() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = credentials.installed;
  const REDIRECT_URI = 'http://localhost:3001/oauth2callback';

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\n===========================================');
  console.log('Gmail OAuth2 Setup');
  console.log('===========================================');
  console.log('\nStep 1: Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nStep 2: Login with Gmail and click Allow');
  console.log('Step 3: You will be redirected back automatically');
  console.log('\nWaiting for authorization...\n');

  // Open browser automatically
  const { exec } = require('child_process');
  exec(`start "" "${authUrl}"`);

  // Local server to catch the OAuth callback
  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname === '/oauth2callback') {
        const code = parsed.query.code;
        if (!code) {
          res.writeHead(400);
          res.end('No code received');
          reject(new Error('No authorization code'));
          return;
        }

        try {
          const { tokens } = await oauth2Client.getToken(code);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px">
              <h2 style="color:green">✅ Gmail Authorization Successful!</h2>
              <p>token.json has been saved. You can close this tab.</p>
              <p>Your Gmail MCP is now ready to use.</p>
            </body></html>
          `);

          console.log('✅ token.json saved successfully at:', TOKEN_PATH);
          console.log('\nGmail MCP is ready! Restart Claude Code to activate.\n');
          server.close();
          resolve();
        } catch (err) {
          res.writeHead(500);
          res.end('Error: ' + err.message);
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(3001, () => {
      console.log('OAuth callback server listening on http://localhost:3001');
    });

    server.on('error', reject);

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout - please try again'));
    }, 5 * 60 * 1000);
  });
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
