import { type NextRequest } from 'next/server';
import { getSettings } from '@/lib/settings';
import { getPromptBodies } from '@/lib/prompts';
import { renderTemplate } from '@/lib/prompt-template';
import { corsHeaders } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public, non-secret widget settings: greeting and company name. */
export async function GET(req: NextRequest) {
  const [settings, prompts] = await Promise.all([getSettings(), getPromptBodies()]);
  const body = {
    companyName: settings.company_name,
    greeting: renderTemplate(prompts.chat_greeting || 'Hi! How can we help?', { company_name: settings.company_name }),
    chatEnabled: true,
  };
  return Response.json(body, { headers: { ...corsHeaders(req.headers.get('origin')), 'Cache-Control': 'public, max-age=30' } });
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}
