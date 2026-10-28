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
  minCancelHours: 2,
  workingHours: {
    '1': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '2': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '3': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '4': { active: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '5': { active: true, start: '08:00', end: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
    '6': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },
    '0': { active: false, start: '08:00', end: '12:00', lunchStart: '', lunchEnd: '' },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// GET /api/clinic/settings - Obter configurações do Perfil Único do Médico
export async function GET() {
  try {
    try {
      let clinic = await prisma.clinic.findFirst();
      if (clinic) {
        let parsedWorkingHours = {};
        try {
          parsedWorkingHours = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        } catch (e) {
          parsedWorkingHours = memoryClinic.workingHours;
        }

        return NextResponse.json({
          success: true,
          clinic: {
            ...clinic,
            doctorName: clinic.doctorName || clinic.name,
            crm: clinic.crm || 'CRM/SP 148.910',
            address: clinic.address || 'Sala 402',
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

// POST /api/clinic/settings - Atualizar configurações do perfil do médico / consultório
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
      minCancelHours,
      workingHours,
    } = body;

    const dataToUpdate: any = {};
    if (name) dataToUpdate.name = name;
    if (doctorName) dataToUpdate.doctorName = doctorName;
    if (specialty) dataToUpdate.specialty = specialty;
    if (crm !== undefined) dataToUpdate.crm = crm;
    if (email) dataToUpdate.email = email;
    if (phone) dataToUpdate.phone = phone;
    if (address !== undefined) dataToUpdate.address = address;
    if (slotDurationMinutes) dataToUpdate.slotDurationMinutes = parseInt(slotDurationMinutes);
    if (minCancelHours) dataToUpdate.minCancelHours = parseInt(minCancelHours);

    if (workingHours) {
      dataToUpdate.workingHours = typeof workingHours === 'string' ? workingHours : JSON.stringify(workingHours);
    }

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
            slotDurationMinutes: slotDurationMinutes ? parseInt(slotDurationMinutes) : 30,
            minCancelHours: minCancelHours ? parseInt(minCancelHours) : 2,
            workingHours: dataToUpdate.workingHours || JSON.stringify(memoryClinic.workingHours),
          },
        });
      } else {
        clinic = await prisma.clinic.update({
          where: { id: clinic.id },
          data: dataToUpdate,
        });
      }

      let parsedWorkingHours = {};
      try {
        parsedWorkingHours = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
      } catch (e) {
        parsedWorkingHours = memoryClinic.workingHours;
      }

      // Sincronizar em memória
      memoryClinic = {
        ...memoryClinic,
        ...clinic,
        doctorName: clinic.doctorName || clinic.name,
        crm: clinic.crm || memoryClinic.crm,
        address: clinic.address || memoryClinic.address,
        workingHours: parsedWorkingHours as any,
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        clinic: memoryClinic,
      });
    } catch (dbErr) {
      console.warn('⚠️ [Clinic Settings DB Update Error] Atualizando fallback em memória:', dbErr);
      
      const parsedHours = workingHours 
        ? (typeof workingHours === 'string' ? JSON.parse(workingHours) : workingHours) 
        : memoryClinic.workingHours;

      memoryClinic = {
        ...memoryClinic,
        name: name || memoryClinic.name,
        doctorName: doctorName || name || memoryClinic.doctorName,
        specialty: specialty || memoryClinic.specialty,
        crm: crm !== undefined ? crm : memoryClinic.crm,
        email: email || memoryClinic.email,
        phone: phone || memoryClinic.phone,
        address: address !== undefined ? address : memoryClinic.address,
        slotDurationMinutes: slotDurationMinutes ? parseInt(slotDurationMinutes) : memoryClinic.slotDurationMinutes,
        minCancelHours: minCancelHours ? parseInt(minCancelHours) : memoryClinic.minCancelHours,
        workingHours: parsedHours,
        updatedAt: new Date().toISOString(),
      };

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
