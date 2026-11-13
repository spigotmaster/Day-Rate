// Run once on your own computer: node server/generate-vapid.mjs
// Prints the PUBLIC key (goes in wrangler.toml and src/config.js) and the PRIVATE key (a secret: never commit it, never paste it in chat).
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
let s = ''; raw.forEach((b) => { s += String.fromCharCode(b); });
console.log('PUBLIC KEY (safe to share):\n' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
console.log('\nPRIVATE KEY (secret). Save with:  npx wrangler secret put VAPID_PRIVATE_JWK  and paste the single line below:\n' + JSON.stringify(jwk));
