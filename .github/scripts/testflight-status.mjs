import { createPrivateKey, sign } from 'node:crypto';

const keyId = process.env.APP_STORE_CONNECT_KEY_ID?.trim();
const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID?.trim();
const pem = process.env.APP_STORE_CONNECT_API_KEY?.trim();
if (!/^[A-Z0-9]{10}$/.test(keyId ?? '')) throw new Error('App Store Connect key ID must be 10 uppercase letters/digits.');
if (!/^[0-9a-f-]{36}$/i.test(issuerId ?? '')) throw new Error('App Store Connect issuer ID must be a UUID.');
const key = createPrivateKey(pem);
if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
  throw new Error('App Store Connect private key must be an ES256 key.');
}
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function request(path) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuerId, iat: now - 10, exp: now + 600, aud: 'appstoreconnect-v1' })}`;
  const token = `${body}.${sign('sha256', Buffer.from(body), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  const response = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`App Store Connect returned HTTP ${response.status}; verify the matching key ID, issuer ID, and active private key in repository secrets.`);
  return response.json();
}
const apps = await request(`apps?${new URLSearchParams({ 'filter[bundleId]': 'com.dyllan.xlate', limit: '1' })}`);
if (apps.data.length !== 1) throw new Error('The API key cannot access com.dyllan.xlate.');
const appId = apps.data[0].id;
console.log(`App Store Connect authentication succeeded for com.dyllan.xlate (app ${appId}).`);
if (process.argv.includes('--wait')) {
  const buildNumber = process.env.TESTFLIGHT_BUILD_NUMBER;
  if (!/^\d+$/.test(buildNumber ?? '')) throw new Error('TESTFLIGHT_BUILD_NUMBER is required.');
  for (let attempt = 0; attempt < 30; attempt++) {
    const builds = await request(`builds?${new URLSearchParams({ 'filter[app]': appId, 'filter[version]': buildNumber, include: 'preReleaseVersion', limit: '10' })}`);
    const versionIds = new Set((builds.included ?? []).filter(x => x.type === 'preReleaseVersions' && x.attributes.version === '1.0.1').map(x => x.id));
    const build = builds.data.find(x => versionIds.has(x.relationships.preReleaseVersion.data.id));
    if (build) {
      console.log(JSON.stringify({ version: '1.0.1', build: buildNumber, ...build.attributes }));
      if (build.attributes.processingState === 'VALID') {
        if (build.attributes.expired) throw new Error('The uploaded build is expired.');
        console.log('Apple has processed the new TestFlight build successfully.');
        process.exit(0);
      }
      if (['FAILED', 'INVALID'].includes(build.attributes.processingState)) throw new Error('Apple rejected build processing.');
    } else console.log('Waiting for Apple to list the uploaded build.');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  throw new Error('Upload completed, but Apple processing is still pending after 15 minutes.');
}
