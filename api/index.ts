// Vercel serverless function entry point
// This re-exports the Express app so Vercel can handle it as a serverless function
import app from '../server/index';
export default app;
