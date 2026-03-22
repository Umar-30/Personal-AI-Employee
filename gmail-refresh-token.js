/**
 * Gmail Token Refresher
 * Uses existing refresh_token to get a new access_token (no browser needed)
 */
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function main() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = credentials.installed;
  const REDIRECT_URI = 'http://localhost:3001/oauth2callback';

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const currentToken = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));

  if (!currentToken.refresh_token) {
    console.error('❌ No refresh_token found in token.json. Run gmail-auth-setup.js to re-authenticate.');
    process.exit(1);
  }

  console.log('🔄 Refreshing Gmail access token using refresh_token...');

  oauth2Client.setCredentials(currentToken);

  const { credentials: newTokens } = await oauth2Client.refreshAccessToken();

  // Preserve refresh_token if not returned in new response
  const merged = {
    ...currentToken,
    ...newTokens,
    refresh_token: newTokens.refresh_token || currentToken.refresh_token,
  };

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));

  const expiryDate = new Date(merged.expiry_date);
  console.log('✅ token.json refreshed successfully!');
  console.log('   New access_token expires:', expiryDate.toISOString());
  console.log('   Token type:', merged.token_type);
  console.log('\n🚀 Gmail MCP is ready. Restart the Gold/Silver daemon.\n');
}

main().catch(err => {
  console.error('❌ Refresh failed:', err.message);
  if (err.message.includes('invalid_grant')) {
    console.error('\n⚠️  refresh_token is revoked or expired.');
    console.error('   Run: node gmail-auth-setup.js   to re-authenticate via browser.\n');
  }
  process.exit(1);
});
