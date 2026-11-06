/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../server.ts';

let appInstance: any = null;

/**
 * Serverless function bridge for Vercel deployment
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!appInstance) {
    appInstance = await createApp();
  }
  return appInstance(req, res);
}
