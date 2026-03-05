const http = require('http');
const https = require('https');
const fs = require('fs');

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/auth/linkedin/callback';

const params = new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  scope: 'w_member_social openid profile email',
  state: 'linkedin_auth_' + Date.now()
});

const authUrl = 'https://www.linkedin.com/oauth/v2/authorization?' + params.toString();

// Save URL to file for easy copying
fs.writeFileSync('linkedin-url.txt', authUrl);

console.log('\n========================================');
console.log('  LinkedIn OAuth Setup');
console.log('========================================');
console.log('\n✅ Auth URL saved to: linkedin-url.txt');
console.log('   Open that file and copy the URL\n');
console.log('========================================');
console.log('OR copy this URL:');
console.log('========================================');
console.log(authUrl);
console.log('========================================\n');

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost:3000');

  if (reqUrl.pathname === '/auth/linkedin/callback') {
    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      const desc = reqUrl.searchParams.get('error_description') || '';
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h1 style="color:red">❌ Error: ${error}</h1><p>${desc}</p>`);
      console.log('\n❌ LinkedIn Error:', error, desc);
      setTimeout(() => server.close(), 1000);
      return;
    }

    if (!code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1 style="color:red">No authorization code received</h1>');
      setTimeout(() => server.close(), 1000);
      return;
    }

    console.log('✅ Authorization code received! Getting access token...');

    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }).toString();

    const options = {
      hostname: 'www.linkedin.com',
      path: '/oauth/v2/accessToken',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const tokenReq = https.request(options, (tokenRes) => {
      let data = '';
      tokenRes.on('data', (chunk) => data += chunk);
      tokenRes.on('end', () => {
        try {
          const tokenData = JSON.parse(data);
          if (tokenData.access_token) {
            const token = tokenData.access_token;

            // Save token to file
            fs.writeFileSync('linkedin-token.txt', token);

            // Update .env file
            try {
              let envContent = fs.readFileSync('.env', 'utf8');
              envContent = envContent.replace('LINKEDIN_ACCESS_TOKEN=', 'LINKEDIN_ACCESS_TOKEN=' + token);
              fs.writeFileSync('.env', envContent);
              console.log('✅ Token saved to .env file automatically!');
            } catch (e) {
              console.log('ℹ️  Could not update .env automatically');
            }

            console.log('\n========================================');
            console.log('✅ SUCCESS! LinkedIn Connected!');
            console.log('========================================');
            console.log('Token also saved to: linkedin-token.txt');
            console.log('Expires in:', Math.round(tokenData.expires_in / 3600), 'hours');
            console.log('========================================\n');

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family:Arial;text-align:center;padding:50px;background:#f0fff4">
                  <h1 style="color:#22c55e">✅ LinkedIn Connected!</h1>
                  <p>Access token saved successfully.</p>
                  <p style="color:gray">You can close this window and go back to your terminal.</p>
                </body>
              </html>
            `);
          } else {
            console.log('\n❌ Token Error:', JSON.stringify(tokenData, null, 2));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<h1 style="color:red">Token Error</h1><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
          }
        } catch (e) {
          console.log('\n❌ Error parsing response:', e.message);
          console.log('Response:', data);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<h1 style="color:red">Error</h1><pre>${data}</pre>`);
        }
        setTimeout(() => server.close(), 2000);
      });
    });

    tokenReq.on('error', (e) => {
      console.log('\n❌ Network Error:', e.message);
      setTimeout(() => server.close(), 1000);
    });

    tokenReq.write(postData);
    tokenReq.end();
  }
});

server.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
  console.log('⏳ Waiting for LinkedIn authorization...\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('❌ Port 3000 busy. Run this command first:');
    console.log('   npx kill-port 3000');
    console.log('   Then run this script again.');
  } else {
    console.log('❌ Server error:', e.message);
  }
});
