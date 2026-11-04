import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/apiAuth';
import { parseBRT } from '@/lib/ai/tools';
import { addMinutes } from 'date-fns';

export const dynamic = 'force-dynamic';

const NOMES_EXEMPLO = [
  'Lucas Gabriel Alves', 'Camila Beatriz Santos', 'Matheus Oliveira Lima', 'Larissa Ferreira Costa',
  'Rodrigo Mendes Silva', 'Juliana Barbosa Rocha', 'Thiago Henrique Dias', 'Mariana Carvalho Castro',
  'Felipe Augusto Souza', 'Beatriz Nogueira Ribeiro', 'Guilherme Duarte Moreira', 'Amanda Cristina Cardoso',
  'Bruno Eduardo Ramos', 'Carolina Martins Teixeira', 'Leonardo Vinicius Melo', 'Gabriela Fernandes Farias',
  'Vinicius Gabriel Pires', 'Rafaela Borges Monteiro', 'Eduardo Cesar Machado', 'Fernanda Lopes Peixoto'
];

function getRandomCPF(): string {
  const n = () => Math.floor(Math.random() * 9);
  return `${n()}${n()}${n()}.${n()}${n()}${n()}.${n()}${n()}${n()}-${n()}${n()}`;
}

function getRandomBirthDate(): string {
  const start = new Date(1970, 0, 1).getTime();
  const end = new Date(2018, 11, 31).getTime();
  const d = new Date(start + Math.random() * (end - start));
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getRandomPhone(): string {
  const ddd = '11';
  const prefix = '9' + Math.floor(1000 + Math.random() * 9000);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `(${ddd}) ${prefix}-${suffix}`;
}

// POST /api/admin/testing
export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { action } = body;

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Nenhum consultório encontrado.' }, { status: 404 });
    }

    // AÇÃO 1: LIMPAR TODAS AS CONSULTAS MARCADAS
    if (action === 'clear_appointments') {
      const deleted = await prisma.appointment.deleteMany({
        where: { clinicId: clinic.id },
      });
      return NextResponse.json({
        success: true,
        message: `${deleted.count} consulta(s) foram apagadas com sucesso! A agenda agora está 100% limpa.`,
        count: deleted.count,
      });
    }

    // AÇÃO 2: POVOAR TODA A AGENDA ABERTA
    if (action === 'populate_schedule') {
      let workingHoursConfig: any = {};
      try {
        workingHoursConfig = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
      } catch (e) {
        workingHoursConfig = {};
      }

      const meta = workingHoursConfig?.meta || {};
      const startDateStr = meta.scheduleStartDate || '';
      const endDateStr = meta.scheduleEndDate || '';
      const selectedDays: string[] = Array.isArray(meta.selectedDays) && meta.selectedDays.length > 0
        ? meta.selectedDays.map(String)
        : ['1', '2', '3', '4', '5'];

      if (!startDateStr || !endDateStr) {
        return NextResponse.json({
          error: 'A agenda não possui um período de abertura configurado. Acesse "Criar Agenda", defina a Data de Início e Término e salve primeiro.',
        }, { status: 400 });
      }

      const [sy, sm, sd] = startDateStr.split('-').map(Number);
      const [ey, em, ed] = endDateStr.split('-').map(Number);

      const curDate = new Date(sy, sm - 1, sd, 0, 0, 0);
      const endDate = new Date(ey, em - 1, ed, 23, 59, 59);

      if (curDate > endDate) {
        return NextResponse.json({
          error: 'Data inicial é maior que a data final configurada na agenda.',
        }, { status: 400 });
      }

      // Parâmetros de horários
      const workStart = meta.workStartTime || '08:00';
      const workEnd = meta.workEndTime || '17:00';
      const breakEnabled = meta.breakEnabled !== undefined ? Boolean(meta.breakEnabled) : true;
      const breakStart = meta.breakStartTime || '12:00';
      const breakEnd = meta.breakEndTime || '13:00';
      const slotDuration = Number(meta.slotDurationMinutes || clinic.slotDurationMinutes) || 30;

      const [startH, startM] = workStart.split(':').map(Number);
      const [endH, endM] = workEnd.split(':').map(Number);
      const [bStartH, bStartM] = breakStart.split(':').map(Number);
      const [bEndH, bEndM] = breakEnd.split(':').map(Number);

      const lunchStartMinutes = (bStartH || 12) * 60 + (bStartM || 0);
      const lunchEndMinutes = (bEndH || 13) * 60 + (bEndM || 0);
      const endMinutes = (endH || 17) * 60 + (endM || 0);

      // Buscar agendamentos existentes para não sobrepor
      const existing = await prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          startTime: { gte: curDate, lte: endDate },
        },
        select: { startTime: true },
      });
      const occupiedTimes = new Set(existing.map((a) => a.startTime.toISOString()));

      // Criar um pool de pacientes aleatórios caso não existam suficientes
      const createdPatients = [];
      for (const nome of NOMES_EXEMPLO) {
        const phone = getRandomPhone();
        const cpf = getRandomCPF();
        const birthDate = getRandomBirthDate();

        let pat = await prisma.patient.findFirst({
          where: { clinicId: clinic.id, name: nome },
        });

        if (!pat) {
          pat = await prisma.patient.create({
            data: {
              clinicId: clinic.id,
              name: nome,
              phone: `+55${phone.replace(/\D/g, '')}`,
              cpf,
              birthDate,
              notes: 'Paciente gerado automaticamente pela Área de Testes',
            },
          });
        }
        createdPatients.push(pat);
      }

      let appointmentsCreated = 0;
      const todayISO = new Date().toISOString().slice(0, 10);

      // Percorrer cada dia do período
      const loopDate = new Date(curDate);
      while (loopDate <= endDate) {
        const dayOfWeek = String(loopDate.getDay());
        const y = loopDate.getFullYear();
        const m = String(loopDate.getMonth() + 1).padStart(2, '0');
        const d = String(loopDate.getDate()).padStart(2, '0');
        const dateISO = `${y}-${m}-${d}`;

        // Se o dia da semana estiver ativo no Criar Agenda
        if (selectedDays.includes(dayOfWeek)) {
          let curMin = (startH || 8) * 60 + (startM || 0);

          while (curMin + slotDuration <= endMinutes) {
            // Pular intervalo de almoço
            if (breakEnabled && curMin >= lunchStartMinutes && curMin < lunchEndMinutes) {
              curMin = lunchEndMinutes;
              continue;
            }

            const h = Math.floor(curMin / 60);
            const min = curMin % 60;
            const timeStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

            const slotStart = parseBRT(`${dateISO}T${timeStr}:00`);
            const slotEnd = addMinutes(slotStart, slotDuration);

            if (!occupiedTimes.has(slotStart.toISOString())) {
              // Selecionar um paciente aleatório do pool
              const randomPatient = createdPatients[Math.floor(Math.random() * createdPatients.length)];
              const statuses = ['AGENDADO', 'CONFIRMADO', 'CONFIRMADO'];
              const status = dateISO < todayISO ? 'REALIZADO' : statuses[Math.floor(Math.random() * statuses.length)];

              await prisma.appointment.create({
                data: {
                  clinicId: clinic.id,
                  patientId: randomPatient.id,
                  startTime: slotStart,
                  endTime: slotEnd,
                  status,
                  notes: 'Consulta gerada automaticamente para testes',
                },
              });

              occupiedTimes.add(slotStart.toISOString());
              appointmentsCreated++;
            }

            curMin += slotDuration;
          }
        }

        // Avançar 1 dia
        loopDate.setDate(loopDate.getDate() + 1);
      }

      return NextResponse.json({
        success: true,
        message: `${appointmentsCreated} consulta(s) foram geradas e distribuídas com sucesso em toda a grade aberta!`,
        count: appointmentsCreated,
      });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Erro em POST /api/admin/testing:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
