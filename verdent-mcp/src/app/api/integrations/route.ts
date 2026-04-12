// Integration settings API — persist API keys per integration
import { NextRequest, NextResponse } from 'next/server';

const integrationConfig: Record<string, Record<string, string>> = {};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'default';
  return NextResponse.json({ integrations: integrationConfig[userId] || {} });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId = 'default', integrations } = body;
    integrationConfig[userId] = { ...(integrationConfig[userId] || {}), ...integrations };
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId') || 'default';
  const key = searchParams.get('key');
  if (key && integrationConfig[userId]) delete integrationConfig[userId][key];
  return NextResponse.json({ success: true });
}
