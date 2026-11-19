/**
 * Runs once when the server starts: creates the database tables (migrations/*.sql) and,
 * on the very first run, loads the sample data (seeds/sample-data.sql). No manual step.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { prepareDatabase } = await import('./lib/startup');
  await prepareDatabase();
}
