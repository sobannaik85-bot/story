import { getPushConfig, json } from './_shared/push.js';

export default async function handler() {
  try {
    const { publicKey } = getPushConfig();
    return json({ publicKey });
  } catch (error) {
    return json({ error: error.message }, 503);
  }
}
