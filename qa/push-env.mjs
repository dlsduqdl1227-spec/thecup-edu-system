// Disposable localhost QA only. Keys and records never leave this process.
import {env as local} from './sqlite-env.mjs';
import webpush from 'web-push';
const keys=globalThis.__eduQaPushKeys??=webpush.generateVAPIDKeys();
export const env={...local,WEB_PUSH_VAPID_PUBLIC_KEY:keys.publicKey,WEB_PUSH_VAPID_PRIVATE_KEY:keys.privateKey};
