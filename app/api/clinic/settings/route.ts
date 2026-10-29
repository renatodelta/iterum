import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Perfil Único do Médico / Clínica - Estado em memória para fallback resiliente
let memoryClinic: any = {
  id: 'clinic-default-1',
  name: 'Consultório Dr. Renato Silva',
  doctorName: 'Dr. Renato Silva',
  specialty: 'Cardiologia e Clínica Geral',
  crm: 'CRM/SP 148.910',
  email: 'contato@drrenatosilva.med.br',
  phone: '(11) 98888-7777',
  address: 'Av. Paulista, 1000 - Conjunto 402 - Bela Vista, São Paulo - SP',
  slotDurationMinutes: 30,
  returnSlotDurationMinutes: 20,
  scheduleStartDate: '',
  scheduleEndDate: '',
  workStartTime: '08:00',
  workEndTime: '17:00',
  breakEnabled: true,
  breakStartTime: '12:00',
  breakEndTime: '13:00',
  selectedDays: [],
  minCancelHours: 2,
  workingHours: {
    '1': { active: false, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '2': { active: false, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '3': { active: false, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '4': { active: false, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '5': { active: false, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '6': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },
    '0': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },
    meta: {
      scheduleStartDate: '',
      scheduleEndDate: '',
      workStartTime: '08:00',
      workEndTime: '17:00',
      breakEnabled: true,
      breakStartTime: '12:00',
      breakEndTime: '13:00',
      slotDurationMinutes: 30,
      returnSlotDurationMinutes: 20,
      maxReturnSlotsPerDay: 4,
      returnSlotTimes: [],
      selectedDays: [],
    },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// GET /api/clinic/settings - Obter configurações da Agenda e Perfil do Médico
export async function GET() {
  try {
    try {
      let clinic = await prisma.clinic.findFirst();
      if (clinic) {
        let parsedWorkingHours: any = {};
        try {
          parsedWorkingHours = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        } catch (e) {
          parsedWorkingHours = memoryClinic.workingHours;
        }

        const meta = parsedWorkingHours?.meta || {};

        return NextResponse.json({
          success: true,
          clinic: {
            ...clinic,
            doctorName: clinic.doctorName || clinic.name || memoryClinic.doctorName,
            crm: clinic.crm || memoryClinic.crm,
            address: clinic.address || memoryClinic.address,
            slotDurationMinutes: clinic.slotDurationMinutes || meta.slotDurationMinutes || memoryClinic.slotDurationMinutes,
            returnSlotDurationMinutes: meta.returnSlotDurationMinutes || memoryClinic.returnSlotDurationMinutes,
            maxReturnSlotsPerDay: meta.maxReturnSlotsPerDay !== undefined ? meta.maxReturnSlotsPerDay : 4,
            returnSlotTimes: meta.returnSlotTimes || ['11:00', '16:00', '16:30', '17:00'],
            scheduleStartDate: meta.scheduleStartDate !== undefined ? meta.scheduleStartDate : memoryClinic.scheduleStartDate,
            scheduleEndDate: meta.scheduleEndDate !== undefined ? meta.scheduleEndDate : memoryClinic.scheduleEndDate,
            workStartTime: meta.workStartTime || memoryClinic.workStartTime,
            workEndTime: meta.workEndTime || memoryClinic.workEndTime,
            breakEnabled: meta.breakEnabled !== undefined ? meta.breakEnabled : memoryClinic.breakEnabled,
            breakStartTime: meta.breakStartTime || memoryClinic.breakStartTime,
            breakEndTime: meta.breakEndTime || memoryClinic.breakEndTime,
            selectedDays: meta.selectedDays !== undefined ? meta.selectedDays : memoryClinic.selectedDays,
            workingHours: parsedWorkingHours,
          },
        });
      }
    } catch (dbErr) {
      console.warn('⚠️ [Clinic Settings] Falha DB, usando fallback em memória:', dbErr);
    }

    return NextResponse.json({
      success: true,
      clinic: memoryClinic,
    });
  } catch (error: any) {
    console.error('Erro em GET /api/clinic/settings:', error);
    return NextResponse.json({ success: true, clinic: memoryClinic });
  }
}

// POST /api/clinic/settings - Atualizar parâmetros de criação de agenda e perfil do médico
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      doctorName,
      specialty,
      crm,
      email,
      phone,
      address,
      slotDurationMinutes,
      returnSlotDurationMinutes,
      maxReturnSlotsPerDay,
      returnSlotTimes,
      scheduleStartDate,
      scheduleEndDate,
      workStartTime,
      workEndTime,
      breakEnabled,
      breakStartTime,
      breakEndTime,
      selectedDays,
      minCancelHours,
      workingHours,
    } = body;

    // Montar o objeto completo de workingHours com a grade de dias e meta-parâmetros da agenda
    let finalWorkingHours: any = {};
    if (workingHours && typeof workingHours === 'object' && !Array.isArray(workingHours)) {
      finalWorkingHours = { ...workingHours };
    }

    const currentSelectedDays: string[] = selectedDays !== undefined
      ? (Array.isArray(selectedDays) ? selectedDays.map(String) : [])
      : (finalWorkingHours.meta?.selectedDays || memoryClinic.selectedDays || []);

    const currentWorkStart: string = workStartTime || finalWorkingHours.meta?.workStartTime || memoryClinic.workStartTime || '08:00';
    const currentWorkEnd: string = workEndTime || finalWorkingHours.meta?.workEndTime || memoryClinic.workEndTime || '17:00';
    const currentBreakEnabled: boolean = breakEnabled !== undefined
      ? Boolean(breakEnabled)
      : (finalWorkingHours.meta?.breakEnabled !== undefined ? finalWorkingHours.meta.breakEnabled : memoryClinic.breakEnabled);
    const currentBreakStart: string = breakStartTime || finalWorkingHours.meta?.breakStartTime || memoryClinic.breakStartTime || '12:00';
    const currentBreakEnd: string = breakEndTime || finalWorkingHours.meta?.breakEndTime || memoryClinic.breakEndTime || '13:00';
    const currentScheduleStart: string = scheduleStartDate !== undefined ? scheduleStartDate : (finalWorkingHours.meta?.scheduleStartDate || memoryClinic.scheduleStartDate || '');
    const currentScheduleEnd: string = scheduleEndDate !== undefined ? scheduleEndDate : (finalWorkingHours.meta?.scheduleEndDate || memoryClinic.scheduleEndDate || '');
    const currentSlotDuration: number = slotDurationMinutes ? parseInt(slotDurationMinutes, 10) : (memoryClinic.slotDurationMinutes || 30);
    const currentReturnDuration: number = returnSlotDurationMinutes ? parseInt(returnSlotDurationMinutes, 10) : (memoryClinic.returnSlotDurationMinutes || 20);
    const currentMaxReturnSlots: number = maxReturnSlotsPerDay !== undefined ? parseInt(maxReturnSlotsPerDay, 10) : (finalWorkingHours.meta?.maxReturnSlotsPerDay ?? 4);
    const currentReturnSlotTimes: string[] = Array.isArray(returnSlotTimes)
      ? returnSlotTimes
      : (finalWorkingHours.meta?.returnSlotTimes || []);

    // Gerar horários para os 7 dias da semana (0 = Domingo a 6 = Sábado)
    ['0', '1', '2', '3', '4', '5', '6'].forEach((day) => {
      const isActive = currentSelectedDays.includes(day);
      finalWorkingHours[day] = {
        active: isActive,
        start: currentWorkStart,
        end: currentWorkEnd,
        lunchStart: currentBreakEnabled ? currentBreakStart : '',
        lunchEnd: currentBreakEnabled ? currentBreakEnd : '',
      };
    });

    finalWorkingHours.meta = {
      scheduleStartDate: currentScheduleStart,
      scheduleEndDate: currentScheduleEnd,
      workStartTime: currentWorkStart,
      workEndTime: currentWorkEnd,
      breakEnabled: currentBreakEnabled,
      breakStartTime: currentBreakStart,
      breakEndTime: currentBreakEnd,
      slotDurationMinutes: currentSlotDuration,
      returnSlotDurationMinutes: currentReturnDuration,
      maxReturnSlotsPerDay: currentMaxReturnSlots,
      returnSlotTimes: currentReturnSlotTimes,
      selectedDays: currentSelectedDays,
    };

    const dataToUpdate: any = {
      workingHours: JSON.stringify(finalWorkingHours),
      slotDurationMinutes: currentSlotDuration,
    };

    if (name) dataToUpdate.name = name;
    if (doctorName) dataToUpdate.doctorName = doctorName;
    if (specialty) dataToUpdate.specialty = specialty;
    if (crm !== undefined) dataToUpdate.crm = crm;
    if (email) dataToUpdate.email = email;
    if (phone) dataToUpdate.phone = phone;
    if (address !== undefined) dataToUpdate.address = address;
    if (minCancelHours) dataToUpdate.minCancelHours = parseInt(minCancelHours, 10);

    // Atualizar fallback em memória
    memoryClinic = {
      ...memoryClinic,
      name: name || doctorName || memoryClinic.name,
      doctorName: doctorName || name || memoryClinic.doctorName,
      specialty: specialty || memoryClinic.specialty,
      crm: crm !== undefined ? crm : memoryClinic.crm,
      email: email || memoryClinic.email,
      phone: phone || memoryClinic.phone,
      address: address !== undefined ? address : memoryClinic.address,
      slotDurationMinutes: currentSlotDuration,
      returnSlotDurationMinutes: currentReturnDuration,
      maxReturnSlotsPerDay: currentMaxReturnSlots,
      returnSlotTimes: currentReturnSlotTimes,
      scheduleStartDate: currentScheduleStart,
      scheduleEndDate: currentScheduleEnd,
      workStartTime: currentWorkStart,
      workEndTime: currentWorkEnd,
      breakEnabled: currentBreakEnabled,
      breakStartTime: currentBreakStart,
      breakEndTime: currentBreakEnd,
      selectedDays: currentSelectedDays,
      minCancelHours: minCancelHours ? parseInt(minCancelHours, 10) : memoryClinic.minCancelHours,
      workingHours: finalWorkingHours,
      updatedAt: new Date().toISOString(),
    };

    try {
      let clinic = await prisma.clinic.findFirst();

      if (!clinic) {
        clinic = await prisma.clinic.create({
          data: {
            name: name || doctorName || 'Consultório Médico',
            doctorName: doctorName || name || 'Dr. Renato Silva',
            specialty: specialty || 'Cardiologia',
            crm: crm || 'CRM/SP 148.910',
            email: email || 'contato@consultorio.med.br',
            phone: phone || '(11) 98888-7777',
            address: address || 'Sala 402',
            slotDurationMinutes: currentSlotDuration,
            minCancelHours: minCancelHours ? parseInt(minCancelHours, 10) : 2,
            workingHours: JSON.stringify(finalWorkingHours),
          },
        });
      } else {
        clinic = await prisma.clinic.update({
          where: { id: clinic.id },
          data: dataToUpdate,
        });
      }

      return NextResponse.json({
        success: true,
        clinic: {
          ...memoryClinic,
          ...clinic,
          scheduleStartDate: currentScheduleStart,
          scheduleEndDate: currentScheduleEnd,
          workStartTime: currentWorkStart,
          workEndTime: currentWorkEnd,
          breakEnabled: currentBreakEnabled,
          breakStartTime: currentBreakStart,
          breakEndTime: currentBreakEnd,
          slotDurationMinutes: currentSlotDuration,
          returnSlotDurationMinutes: currentReturnDuration,
          selectedDays: currentSelectedDays,
          workingHours: finalWorkingHours,
        },
      });
    } catch (dbErr) {
      console.warn('⚠️ [Clinic Settings DB Update Error] Atualizando fallback em memória:', dbErr);
      return NextResponse.json({
        success: true,
        clinic: memoryClinic,
      });
    }
  } catch (error: any) {
    console.error('Erro em POST /api/clinic/settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
