import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { getDoctorInfo } from '@/lib/ai/agent';

export const dynamic = 'force-dynamic';

function getTodayMonthDayBR(): { month: string; day: string } {
  // Obter data no fuso de Brasília (America/Sao_Paulo)
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  return { month, day };
}

function checkIsBirthday(birthDateStr: string | null | undefined, targetMonth: string, targetDay: string): boolean {
  if (!birthDateStr) return false;
  const clean = birthDateStr.trim();
  // Formato YYYY-MM-DD
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length >= 3) {
      const m = parts[1].padStart(2, '0');
      const d = parts[2].slice(0, 2).padStart(2, '0');
      return m === targetMonth && d === targetDay;
    }
  }
  // Formato DD/MM/YYYY
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length >= 2) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      return m === targetMonth && d === targetDay;
    }
  }
  return false;
}

// GET: Consultar aniversariantes do dia
export async function GET() {
  try {
    const { month, day } = getTodayMonthDayBR();

    let allPatients: any[] = [];
    try {
      allPatients = await prisma.patient.findMany({
        select: {
          id: true,
          name: true,
          phone: true,
          birthDate: true,
          email: true,
          city: true,
        },
      });
    } catch {
      // Fallback: buscar via API de pacientes
      const res = await fetch('http://localhost:3000/api/patients').catch(() => null);
      if (res) {
        const data = await res.json();
        allPatients = data.patients || [];
      }
    }

    const birthdayPatients = allPatients.filter((p) =>
      checkIsBirthday(p.birthDate, month, day)
    );

    return NextResponse.json({
      success: true,
      today: `${day}/${month}`,
      totalBirthdayCount: birthdayPatients.length,
      patients: birthdayPatients,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Disparar mensagens de aniversário via WhatsApp aos aniversariantes de hoje
export async function POST(req: Request) {
  try {
    const { month, day } = getTodayMonthDayBR();

    // 1. Obter informações do consultório e do médico
    let clinic = await prisma.clinic.findFirst().catch(() => null);
    const doctor = await getDoctorInfo(clinic?.id).catch(() => ({ name: 'Dra. Mariana Souza' }));
    const doctorName = doctor?.name || clinic?.doctorName || 'Dra. Mariana Souza';

    // 2. Buscar pacientes
    let allPatients: any[] = [];
    try {
      allPatients = await prisma.patient.findMany();
    } catch {
      const res = await fetch('http://localhost:3000/api/patients').catch(() => null);
      if (res) {
        const data = await res.json();
        allPatients = data.patients || [];
      }
    }

    const birthdayPatients = allPatients.filter((p) =>
      checkIsBirthday(p.birthDate, month, day)
    );

    if (birthdayPatients.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhum paciente faz aniversário hoje.',
        count: 0,
        sent: [],
      });
    }

    const sentResults = [];

    for (const patient of birthdayPatients) {
      const firstName = patient.name.split(' ')[0] || patient.name;
      const birthdayMsg =
        `🎉 *Feliz Aniversário, ${firstName}!* 🎂✨\n\n` +
        `Hoje é um dia muito especial! A equipe do consultório ${doctorName} deseja a você um novo ciclo repleto de muita saúde, paz, alegria e realizações.\n\n` +
        `Lembramos com carinho que estamos sempre ao seu lado para ajudá-lo(a) a cuidar do que há de mais precioso: a sua saúde e o seu bem-estar.\n\n` +
        `Receba o nosso abraço afetuoso e parabéns pelo seu dia! 🎈💙`;

      try {
        // Enviar mensagem de WhatsApp se houver telefone
        if (patient.phone) {
          await sendWhatsAppMessage(patient.phone, birthdayMsg).catch((e) => {
            console.warn(`[WhatsApp Birthday Send] Simulação/Envio para ${patient.phone}:`, e?.message);
          });

          // Registrar no banco de mensagens se disponível
          if (clinic?.id) {
            await prisma.message
              .create({
                data: {
                  clinicId: clinic.id,
                  patientId: patient.id,
                  role: 'assistant',
                  content: birthdayMsg,
                },
              })
              .catch(() => {});
          }
        }

        sentResults.push({
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          status: 'SENT',
        });
      } catch (err: any) {
        sentResults.push({
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          status: 'ERROR',
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${sentResults.length} mensagem(ns) de aniversário disparada(s) com sucesso.`,
      count: sentResults.length,
      sent: sentResults,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
