import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando popular banco de dados (seed)...');

  // Limpar tabelas existentes em dev
  await prisma.message.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.patient.deleteMany({});
  await prisma.clinic.deleteMany({});

  // 1. Criar Clínica / Médico Principal
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Clínica Vida & Saúde - Dr. Renato Silva',
      email: 'contato@vidae-saude.com.br',
      phone: '+5511988887777',
      specialty: 'Cardiologia e Clínica Geral',
      slotDurationMinutes: 30,
      minCancelHours: 2,
      workingHours: JSON.stringify({
        '1': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' }, // Segunda
        '2': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' }, // Terça
        '3': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' }, // Quarta
        '4': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' }, // Quinta
        '5': { active: true, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' }, // Sexta
        '6': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },          // Sábado
        '0': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },          // Domingo
      }),
    },
  });

  console.log('✅ Clínica criada:', clinic.name, `[ID: ${clinic.id}]`);

  // 2. Criar Pacientes
  const patient1 = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      name: 'Carlos Eduardo',
      phone: '+5511999991111',
      cpf: '123.456.789-00',
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      name: 'Mariana Souza',
      phone: '+5511999992222',
      cpf: '987.654.321-11',
    },
  });

  const patient3 = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      name: 'Ana Paula Lima',
      phone: '+5511999993333',
      cpf: '456.789.123-22',
    },
  });

  console.log('✅ Pacientes criados');

  // Definir datas para amanhã e depois de amanhã
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setMinutes(30);

  const dayAfterTomorrow = new Date(now);
  dayAfterTomorrow.setDate(now.getDate() + 2);
  dayAfterTomorrow.setHours(14, 30, 0, 0);

  const dayAfterTomorrowEnd = new Date(dayAfterTomorrow);
  dayAfterTomorrowEnd.setMinutes(dayAfterTomorrow.getMinutes() + 30);

  // 3. Criar Agendamentos
  const appt1 = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: patient1.id,
      startTime: tomorrow,
      endTime: tomorrowEnd,
      status: 'AGENDADO',
      notes: 'Consulta de rotina cardiologia - Pressão Alta',
    },
  });

  const appt2 = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: patient2.id,
      startTime: dayAfterTomorrow,
      endTime: dayAfterTomorrowEnd,
      status: 'CONFIRMADO',
      notes: 'Retorno com exames de sangue',
    },
  });

  console.log('✅ Agendamentos criados');

  // 4. Criar Histórico de Mensagens Demonstrativo
  await prisma.message.createMany({
    data: [
      {
        clinicId: clinic.id,
        patientId: patient1.id,
        role: 'user',
        content: 'Olá, gostaria de saber se tenho consulta marcada para amanhã.',
      },
      {
        clinicId: clinic.id,
        patientId: patient1.id,
        role: 'assistant',
        content: `Olá Carlos! Sim, você tem uma consulta agendada para amanhã às 10:00 com o Dr. Renato Silva. Você confirma a sua presença?`,
      },
    ],
  });

  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
