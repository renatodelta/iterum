export interface PermissionItem {
  id: string;
  label: string;
  description: string;
  category: 'Agenda' | 'Consultas' | 'Pacientes' | 'Configurações';
}

export const USER_PERMISSIONS: PermissionItem[] = [
  {
    id: 'visualizar_agenda',
    label: 'Visualizar agenda',
    description: 'Permite consultar a grade de horários e compromissos do médico',
    category: 'Agenda',
  },
  {
    id: 'configurar_perfil',
    label: 'Configurar Perfil',
    description: 'Permite editar dados do médico, especialidade, CRM e expediente',
    category: 'Configurações',
  },
  {
    id: 'bloquear_horario',
    label: 'Bloquear horário',
    description: 'Permite bloquear horários específicos e registrar indisponibilidades',
    category: 'Agenda',
  },
  {
    id: 'agendamento',
    label: 'Agendamento',
    description: 'Permite realizar novos agendamentos de consultas regulares',
    category: 'Consultas',
  },
  {
    id: 'desmarcacao',
    label: 'Desmarcação',
    description: 'Permite cancelar atendimentos e liberar horários na agenda',
    category: 'Consultas',
  },
  {
    id: 'remarcacao',
    label: 'Remarcação',
    description: 'Permite reagendar pacientes para outro dia ou horário',
    category: 'Consultas',
  },
  {
    id: 'agendamento_extra',
    label: 'Agendamento Extra',
    description: 'Permite agendar encaixes extraordinários além da capacidade padrão',
    category: 'Consultas',
  },
  {
    id: 'dados_paciente',
    label: 'Dados do paciente',
    description: 'Permite acessar, criar e editar prontuários e cadastros de pacientes',
    category: 'Pacientes',
  },
  {
    id: 'gerar_agenda',
    label: 'Gerar agenda',
    description: 'Permite abrir e gerar novos períodos de agendamento na grade',
    category: 'Agenda',
  },
];

// Gera login único automático: primeiro nome em minúsculo + iniciais dos sobrenomes
export function generateAutoLogin(
  fullName: string,
  userList: any[] = [],
  currentUserId?: string
): string {
  if (!fullName || !fullName.trim()) return '';

  const clean = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim();

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';

  const firstName = parts[0];
  const stopWords = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  const surnames = parts.slice(1).filter((p) => !stopWords.has(p));

  const initials = surnames.map((s) => s[0] || '').join('');
  const baseLogin = `${firstName}${initials}` || firstName;

  const existingLogins = new Set(
    userList
      .filter((u) => !currentUserId || u.id !== currentUserId)
      .map((u) => (u.login || '').toLowerCase().trim())
      .filter(Boolean)
  );

  if (!existingLogins.has(baseLogin)) {
    return baseLogin;
  }

  let counter = 2;
  while (existingLogins.has(`${baseLogin}${counter}`)) {
    counter++;
  }
  return `${baseLogin}${counter}`;
}

export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}
