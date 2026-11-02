import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseBRT, formatBRTShort } from '@/lib/ai/tools';
import { getDoctorInfo } from '@/lib/ai/agent';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { addMinutes } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Rota pública (paciente agendando pelo site): limita tentativas por IP para evitar abuso/spam de WhatsApp
    if (!rateLimit(`book:${getClientIp(req)}`, 10, 10 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Muitas tentativas de agendamento. Aguarde alguns minutos e tente novamente.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const {
      startTime,
      contactPhone,
      patientName,
      patientCpf,
      patientPhone,
      isForOtherPerson,
      notes,
    } = body;

    if (!startTime || !patientName || !patientPhone) {
      return NextResponse.json(
        { error: 'Por favor, informe a data/hora, nome completo e telefone do paciente.' },
        { status: 400 }
      );
    }

    // Validação de tipos e tamanhos (a rota é pública)
    const textFields = [startTime, patientName, patientPhone, contactPhone, patientCpf, notes];
    if (
      textFields.some((v) => v !== undefined && v !== null && typeof v !== 'string') ||
      String(patientName).length > 120 ||
      String(patientPhone).replace(/\D/g, '').length < 10 ||
      String(patientPhone).replace(/\D/g, '').length > 13 ||
      (contactPhone && String(contactPhone).replace(/\D/g, '').length > 13) ||
      String(patientCpf || '').length > 20 ||
      String(notes || '').length > 500
    ) {
      return NextResponse.json({ error: 'Dados inválidos. Confira nome, telefone e observações.' }, { status: 400 });
    }

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica cadastrada.' }, { status: 404 });
    }

    const doctor = await getDoctorInfo(clinic.id);

    // Sanitizar telefones
    const cleanPatientPhone = patientPhone.replace(/\D/g, '');
    const formattedPatientPhone = cleanPatientPhone.startsWith('55')
      ? `+${cleanPatientPhone}`
      : `+55${cleanPatientPhone}`;

    const cleanContactPhone = (contactPhone || patientPhone).replace(/\D/g, '');
    const formattedContactPhone = cleanContactPhone.startsWith('55')
      ? `+${cleanContactPhone}`
      : `+55${cleanContactPhone}`;

    const cleanCpf = patientCpf ? patientCpf.replace(/\D/g, '') : '';
    const formattedCpf = cleanCpf.length === 11
      ? `${cleanCpf.slice(0, 3)}.${cleanCpf.slice(3, 6)}.${cleanCpf.slice(6, 9)}-${cleanCpf.slice(9, 11)}`
      : patientCpf || null;

    // 1. Localizar ou cadastrar o paciente no banco de dados
    let patient = null;

    if (isForOtherPerson) {
      // O agendamento é para outra pessoa (ex: Júlio). O contato no WhatsApp é o titular (ex: Renato).
      // Se o paciente informado possui telefone próprio diferente do contato do WhatsApp:
      if (cleanPatientPhone && cleanPatientPhone !== cleanContactPhone) {
        if (cleanCpf) {
          patient = await prisma.patient.findFirst({
            where: {
              clinicId: clinic.id,
              OR: [
                { cpf: { contains: cleanCpf } },
                { phone: { contains: cleanPatientPhone.slice(-8) } },
              ],
            },
          });
        } else {
          patient = await prisma.patient.findFirst({
            where: {
              clinicId: clinic.id,
              phone: { contains: cleanPatientPhone.slice(-8) },
            },
          });
        }

        const patientNotes = `Cadastrado via Agendamento Online por terceiro (WhatsApp: ${formattedContactPhone}). ${notes || ''}`.trim();

        if (patient) {
          patient = await prisma.patient.update({
            where: { id: patient.id },
            data: {
              // Segurança: dados de um paciente já cadastrado (nome e telefone) não são sobrescritos por quem agenda pelo site público
              cpf: patient.cpf || formattedCpf,
              notes: patient.notes ? `${patient.notes} | ${patientNotes}` : patientNotes,
            },
          });
        } else {
          patient = await prisma.patient.create({
            data: {
              clinicId: clinic.id,
              name: patientName.trim(),
              phone: formattedPatientPhone,
              cpf: formattedCpf,
              notes: patientNotes,
            },
          });
        }
      } else {
        // O paciente compartilha o mesmo telefone do titular (ex: dependente/filho).
        // IMPORTANTE: NÃO sobrescrever o nome do titular do WhatsApp!
        let titular = await prisma.patient.findFirst({
          where: {
            clinicId: clinic.id,
            phone: { contains: cleanContactPhone.slice(-8) },
          },
        });

        if (!titular) {
          titular = await prisma.patient.create({
            data: {
              clinicId: clinic.id,
              name: `Titular (${formattedContactPhone})`,
              phone: formattedContactPhone,
              notes: `Responsável/Titular WhatsApp. Marcou para: ${patientName.trim()}`,
            },
          });
        } else {
          // Atualiza apenas as notas do titular sem alterar o seu nome
          await prisma.patient.update({
            where: { id: titular.id },
            data: {
              notes: titular.notes
                ? `${titular.notes} | Responsável/Contato de ${patientName.trim()}`
                : `Responsável/Contato de ${patientName.trim()}`,
            },
          }).catch(() => {});
        }

        patient = titular;
      }
    } else {
      // Atendimento para o próprio titular
      if (cleanCpf) {
        patient = await prisma.patient.findFirst({
          where: {
            clinicId: clinic.id,
            OR: [
              { cpf: { contains: cleanCpf } },
              { phone: { contains: cleanPatientPhone.slice(-8) } },
            ],
          },
        });
      } else {
        patient = await prisma.patient.findFirst({
          where: {
            clinicId: clinic.id,
            phone: { contains: cleanPatientPhone.slice(-8) },
          },
        });
      }

      const patientNotes = (notes || 'Cadastrado via Agendamento Online').trim();

      if (patient) {
        patient = await prisma.patient.update({
          where: { id: patient.id },
          data: {
            // Segurança: dados de um paciente já cadastrado (nome e telefone) não são sobrescritos por quem agenda pelo site público
            cpf: patient.cpf || formattedCpf,
            notes: patient.notes ? `${patient.notes} | ${patientNotes}` : patientNotes,
          },
        });
        console.log(`👤 Paciente existente atualizado no cadastro: ${patient.name} (CPF: ${patient.cpf})`);
      } else {
        patient = await prisma.patient.create({
          data: {
            clinicId: clinic.id,
            name: patientName.trim(),
            phone: formattedPatientPhone,
            cpf: formattedCpf,
            notes: patientNotes,
          },
        });
        console.log(`👤 Novo paciente cadastrado com sucesso: ${patient.name} (CPF: ${patient.cpf}, Tel: ${patient.phone})`);
      }
    }

    // 2. Se for agendado por outra pessoa com telefone diferente, garantir que o contato do marcador fique registrado
    if (isForOtherPerson && cleanContactPhone && cleanContactPhone !== cleanPatientPhone) {
      const existingBooker = await prisma.patient.findFirst({
        where: {
          clinicId: clinic.id,
          phone: { contains: cleanContactPhone.slice(-8) },
        },
      });
      if (!existingBooker) {
        await prisma.patient.create({
          data: {
            clinicId: clinic.id,
            name: `Contato Marcador (${formattedContactPhone})`,
            phone: formattedContactPhone,
            notes: `Marcou consulta para o paciente: ${patientName.trim()} (CPF: ${formattedCpf || 'N/A'})`,
          },
        }).catch((e) => console.warn('Aviso ao registrar contato do marcador:', e.message));
      }
    }

    // 3. Validar data e hora e colisão de agenda
    const start = parseBRT(startTime);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Formato de data e hora inválido.' }, { status: 400 });
    }

    const slotDuration = clinic.slotDurationMinutes || 30;
    const end = addMinutes(start, slotDuration);

    const conflict = await prisma.appointment.findFirst({
      where: {
        clinicId: clinic.id,
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'] },
        OR: [
          { startTime: { lte: start }, endTime: { gt: start } },
          { startTime: { lt: end }, endTime: { gte: end } },
        ],
      },
    });

    if (conflict) {
      return NextResponse.json(
        { error: 'Desculpe, este horário acabou de ser preenchido por outro paciente. Por favor, escolha outro horário.' },
        { status: 409 }
      );
    }

    // 4. Criar o agendamento vinculado ao paciente / titular
    const appointmentNotes = isForOtherPerson
      ? `Agendado via Web para o paciente: ${patientName.trim()} (CPF: ${formattedCpf || 'N/A'}). Solicitado pelo titular WhatsApp: ${formattedContactPhone}. ${notes || ''}`.trim()
      : `Agendado pelo próprio paciente via Web. CPF: ${formattedCpf || 'N/A'}. ${notes || ''}`.trim();

    const appointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        startTime: start,
        endTime: end,
        status: 'AGENDADO',
        notes: appointmentNotes,
      },
    });

    const dataFormatada = formatBRTShort(start);

    // 5. Disparar mensagem de confirmação para o WhatsApp que agendou
    const confirmMessage = isForOtherPerson
      ? `🎉 *Agendamento Confirmado com Sucesso!*\n\nA consulta para *${patientName.trim()}* com *${doctor.name}* foi confirmada para:\n\n📅 *Data:* ${dataFormatada}\n🏥 *Local:* ${clinic.name}\n👤 *Paciente Atendido:* ${patientName.trim()} (CPF: ${formattedCpf || 'Não informado'})\n\n${doctor.name} agradece o contato e deseja um ótimo dia!`
      : `🎉 *Agendamento Confirmado com Sucesso!*\n\nOlá, *${patientName.trim()}*! Sua consulta com *${doctor.name}* foi confirmada para:\n\n📅 *Data:* ${dataFormatada}\n🏥 *Local:* ${clinic.name}\n\n${doctor.name} agradece o contato e deseja um ótimo dia!`;

    // Salvar mensagem no histórico do WhatsApp
    await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'assistant',
        content: confirmMessage,
      },
    }).catch((e) => console.warn('Aviso ao salvar mensagem de confirmação:', e.message));

    // Enviar mensagem real via WhatsApp API
    await sendWhatsAppMessage(formattedContactPhone, confirmMessage);

    // Rota pública: devolve apenas o necessário para a tela de sucesso (nunca o cadastro completo do paciente)
    return NextResponse.json({
      success: true,
      appointment: {
        id: appointment.id,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        status: appointment.status,
      },
      patient: { name: patientName.trim() },
      formattedDate: dataFormatada,
      doctorName: doctor.name,
      clinicName: clinic.name,
    });
  } catch (error: any) {
    console.error('Erro em POST /api/appointments/book:', error.message);
    return NextResponse.json({ error: 'Não foi possível concluir o agendamento. Tente novamente.' }, { status: 500 });
  }
}
