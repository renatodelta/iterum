const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando popular banco de dados (seed JS)...');

  // Limpar tabelas existentes em dev
  await prisma.user.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.patient.deleteMany({});
  await prisma.clinic.deleteMany({});

  // 1. Criar Consultório / Médico Principal (Perfil Único)
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Consultório Dr. Renato Silva',
      doctorName: 'Dr. Renato Silva',
      crm: 'CRM/SP 148.910',
      email: 'contato@drrenatosilva.med.br',
      phone: '+5511988887777',
      address: 'Av. Paulista, 1000 - Conjunto 402 - Bela Vista, São Paulo - SP',
      specialty: 'Cardiologia e Clínica Geral',
      slotDurationMinutes: 30,
      minCancelHours: 2,
      workingHours: JSON.stringify({
        '1': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '2': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '3': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '4': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '5': { active: true, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '6': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },
        '0': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },
      }),
    },
  });

  console.log('✅ Consultório (Perfil Único do Médico) criado:', clinic.name, `[ID: ${clinic.id}]`);

  // 1.1 Criar Usuários com Acesso (Secretárias e Gestores)
  await prisma.user.createMany({
    data: [
      {
        name: 'Juliana Rocha Santos',
        specialty: 'Secretária Executiva',
        cpf: '123.456.789-01',
        email: 'juliana.santos@consultorio.med.br',
        phone: '(11) 98765-4321',
        login: 'julianars',
        password: 'password123',
        role: 'SECRETARIA',
        permissions: JSON.stringify([
          'visualizar_agenda',
          'bloquear_horario',
          'agendamento',
          'desmarcacao',
          'remarcacao',
          'agendamento_extra',
          'dados_paciente',
        ]),
        status: 'ACTIVE',
      },
      {
        name: 'Carlos Eduardo Ferreira',
        specialty: 'Gestão Administrativa',
        cpf: '345.678.901-23',
        email: 'carlos.ferreira@consultorio.med.br',
        phone: '(11) 96543-2109',
        login: 'carlosef',
        password: 'password123',
        role: 'ADMIN',
        permissions: JSON.stringify([
          'visualizar_agenda',
          'configurar_perfil',
          'bloquear_horario',
          'agendamento',
          'desmarcacao',
          'remarcacao',
          'agendamento_extra',
          'dados_paciente',
          'gerar_agenda',
        ]),
        status: 'ACTIVE',
      },
    ],
  });

  console.log('✅ Usuários de gestão e secretária criados');

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

  console.log('✅ Pacientes criados');

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
  await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: patient1.id,
      startTime: tomorrow,
      endTime: tomorrowEnd,
      status: 'AGENDADO',
      notes: 'Consulta de rotina cardiologia - Pressão Alta',
    },
  });

  await prisma.appointment.create({
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

  // 4. Criar Histórico de Mensagens
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
        content: 'Olá Carlos! Sim, você tem uma consulta agendada para amanhã às 10:00 com o Dr. Renato Silva. Você confirma a sua presença?',
      },
    ],
  });

  console.log('🎉 Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
