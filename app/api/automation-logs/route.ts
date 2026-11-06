import { NextRequest, NextResponse } from 'next/server';
import { getAutomationLogs, clearAutomationLogs } from '@/lib/automation-log';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const logs = await getAutomationLogs();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.toLowerCase().trim();

    let filtered = logs;

    if (type && type !== 'TODOS') {
      filtered = filtered.filter((log) => log.type === type);
    }

    if (search) {
      filtered = filtered.filter(
        (log) =>
          log.patientName.toLowerCase().includes(search) ||
          log.patientPhone.includes(search) ||
          (log.patientCpf && log.patientCpf.includes(search)) ||
          log.description.toLowerCase().includes(search) ||
          log.title.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      success: true,
      count: filtered.length,
      logs: filtered,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    await clearAutomationLogs();
    return NextResponse.json({
      success: true,
      message: 'Histórico de Ações da Automação zerado com sucesso.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
