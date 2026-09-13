/* Vercel serverless entry: every /api/* request is rewritten here
   (see vercel.json) and handled by the same Express app. */
import { createApp } from '../server/app.js';

const app = createApp();
export default app;
