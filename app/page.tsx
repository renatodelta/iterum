'use client';

import { useState, useEffect, useMemo } from 'react';
import CareHubDashboard from '@/components/dashboard/CareHubDashboard';
import GoogleCalendarView, { AgendaViewMode } from '@/components/calendar/GoogleCalendarView';
import {
  USER_PERMISSIONS,
  generateAutoLogin,
  formatCPF,
  formatPhone,
} from '@/lib/userPermissions';
import {
  Calendar as CalendarIcon,
  LayoutDashboard,
  Bell,
  ChevronDown,
  Clock,
  UserCheck,
  CalendarCheck2,
  CalendarX,
  RefreshCw,
  Settings,
  Search,
  Phone,
  User,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Plus,
  ShieldCheck,
  Stethoscope,
  Users,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange,
  ListFilter,
  Edit3,
  Trash2,
  Mail,
  Shield,
  Check,
  X,
  UserCog,
  Briefcase,
  Contact,
  HeartPulse,
  CalendarPlus,
  FileText,
  ExternalLink,
  ChevronsUpDown,
  MessageSquare,
  AlertCircle,
  Inbox,
  Sparkles,
  ArrowUpDown,
  Send,
  Building2,
  CheckSquare,
  Square,
  Activity,
  Megaphone,
  Menu,
  SlidersHorizontal,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
} from 'lucide-react';

function formatPhoneBR(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const localDigits = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;

  if (localDigits.length === 11) {
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 7)}-${localDigits.slice(7)}`;
  } else if (localDigits.length === 10) {
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 6)}-${localDigits.slice(6)}`;
  }
  return phone;
}

function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function applyCPFMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function calculateAge(birthDateStr?: string | null): string {
  if (!birthDateStr) return '';
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return `${age} anos`;
}

function getInitials(name: string): string {
  if (!name) return 'PC';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getStatusLabel(status: string | undefined | null): string {
  if (!status) return 'Agendado';
  const s = status.toUpperCase();
  if (s === 'CONFIRMED' || s === 'CONFIRMADO') return 'Confirmado';
  if (s === 'SCHEDULED' || s === 'AGENDADO') return 'Aguardando Confirmação';
  if (s === 'RESCHEDULED' || s === 'REMARCADO') return 'Encaixe Confirmado';
  if (s === 'CANCELED' || s === 'CANCELADO') return 'Cancelado';
  return status;
}

const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DAILY_HOURS = ['08:00', '08:45', '09:30', '10:15', '11:00', '11:45', '13:00', '13:45', '14:30', '15:15', '16:00', '16:45', '17:30'];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'agenda' | 'patients' | 'fila' | 'whatsapp' | 'users' | 'settings'>('agenda');
  const [agendaViewMode, setAgendaViewMode] = useState<AgendaViewMode>('mes');

  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Filtros da Agenda no menu esquerdo
  const [filterConfirmed, setFilterConfirmed] = useState(true);
  const [filterWaiting, setFilterWaiting] = useState(true);
  const [filterEncaixe, setFilterEncaixe] = useState(true);
  const [filterCanceled, setFilterCanceled] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<string | null>(null);

  // Controle de datas e calendário
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  // Busca global
  const [searchQuery, setSearchQuery] = useState('');

  // Estados Mobile
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Cron
  const [cronRunning, setCronRunning] = useState(false);
  const [cronNotice, setCronNotice] = useState<string | null>(null);

  // Modal de Agendamento
  const [showModalNewAppt, setShowModalNewAppt] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [newApptPhone, setNewApptPhone] = useState('');
  const [newApptName, setNewApptName] = useState('');
  const [newApptTime, setNewApptTime] = useState('');
  const [newApptNotes, setNewApptNotes] = useState('');

  // Modal de Detalhes do Agendamento
  const [selectedApptDetails, setSelectedApptDetails] = useState<any | null>(null);

  // Cadastro de Pacientes State
  const [patients, setPatients] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [showModalPatient, setShowModalPatient] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any | null>(null);

  // Form do Paciente
  const [patName, setPatName] = useState('');
  const [patPhone, setPatPhone] = useState('');
  const [patCpf, setPatCpf] = useState('');
  const [patEmail, setPatEmail] = useState('');
  const [patBirthDate, setPatBirthDate] = useState('');
  const [patNotes, setPatNotes] = useState('');

  // Cadastro de Usuários & Controle de Permissões State
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [showModalUser, setShowModalUser] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Form de Usuário (Médico Titular da Agenda ou Equipe de Apoio)
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState<'MEDICO' | 'SECRETARIA' | 'ADMIN' | 'RECEPCIONISTA'>('MEDICO');
  const [userSpecialty, setUserSpecialty] = useState('');
  const [userCrm, setUserCrm] = useState('');
  const [userCpf, setUserCpf] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userLogin, setUserLogin] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [userStatus, setUserStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [showPassword, setShowPassword] = useState(false);
  const [isAutoLogin, setIsAutoLogin] = useState(true);

  // Atualizar relógio em tempo real
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  // Carregar dados iniciais
  useEffect(() => {
    fetchData();
    fetchPatients();
    fetchUsers();
  }, [filterDate, filterStatus]);

  async function fetchData() {
    try {
      setLoading(true);
      const resSettings = await fetch('/api/clinic/settings');
      const dataSettings = await resSettings.json();
      if (dataSettings.clinic) {
        setClinic(dataSettings.clinic);
      }

      let apptUrl = '/api/appointments?';
      if (filterDate) apptUrl += `date=${filterDate}&`;
      if (filterStatus && filterStatus !== 'ALL') apptUrl += `status=${filterStatus}`;

      const resAppts = await fetch(apptUrl);
      const dataAppts = await resAppts.json();
      if (dataAppts.appointments) {
        setAppointments(dataAppts.appointments);
      }
    } catch (e) {
      console.error('Erro ao carregar dados:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPatients() {
    try {
      setLoadingPatients(true);
      const res = await fetch('/api/patients');
      const data = await res.json();
      if (data.patients) {
        setPatients(data.patients);
      }
    } catch (err) {
      console.error('Erro ao carregar pacientes:', err);
    } finally {
      setLoadingPatients(false);
    }
  }

  async function fetchUsers() {
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    } finally {
      setLoadingUsers(false);
    }
  }

  // Cron Lembretes 24h
  async function handleTriggerCronReminders() {
    setCronRunning(true);
    setCronNotice(null);
    try {
      const res = await fetch('/api/appointments/cron-reminders', { method: 'POST' });
      const data = await res.json();
      setCronNotice(`✅ Lembretes enviados! ${data.processed || 0} pacientes notificados via WhatsApp para as próximas 24h.`);
      fetchData();
    } catch (e: any) {
      setCronNotice(`❌ Erro no disparo de lembretes: ${e.message}`);
    } finally {
      setCronRunning(false);
    }
  }

  // Criar Agendamento Manual
  async function handleCreateAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatientId) {
      alert('Selecione obrigatoriamente um paciente cadastrado antes de marcar a consulta.');
      return;
    }
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          patientName: newApptName,
          patientPhone: newApptPhone,
          startTime: newApptTime,
          notes: newApptNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowModalNewAppt(false);
        setSelectedPatientId('');
        setNewApptName('');
        setNewApptPhone('');
        setNewApptTime('');
        setNewApptNotes('');
        fetchData();
        fetchPatients();
      } else {
        alert(data.error || 'Erro ao criar agendamento.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  // Abrir Modal com Slot pré-selecionado
  function openNewApptModalWithSlot(dateObj: Date, hourStr?: string) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const time = hourStr || '09:00';
    const formatted = `${year}-${month}-${day}T${time}`;
    setNewApptTime(formatted);
    setSelectedPatientId('');
    setNewApptName('');
    setNewApptPhone('');
    setShowModalNewAppt(true);
  }

  // Ações de Pacientes
  function handleOpenPatientModal(patToEdit?: any) {
    if (patToEdit) {
      setEditingPatient(patToEdit);
      setPatName(patToEdit.name);
      setPatPhone(formatPhoneBR(patToEdit.phone) || patToEdit.phone);
      setPatCpf(patToEdit.cpf || '');
      setPatEmail(patToEdit.email || '');
      setPatBirthDate(patToEdit.birthDate || '');
      setPatNotes(patToEdit.notes || '');
    } else {
      setEditingPatient(null);
      setPatName('');
      setPatPhone('');
      setPatCpf('');
      setPatEmail('');
      setPatBirthDate('');
      setPatNotes('');
    }
    setShowModalPatient(true);
  }

  async function handleSavePatient(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        id: editingPatient?.id,
        name: patName,
        phone: patPhone,
        cpf: patCpf,
        email: patEmail,
        birthDate: patBirthDate,
        notes: patNotes,
      };

      const method = editingPatient ? 'PUT' : 'POST';
      const res = await fetch('/api/patients', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowModalPatient(false);
        fetchPatients();
      } else {
        alert(data.error || 'Erro ao salvar paciente.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleDeletePatient(id: string) {
    if (!confirm('Deseja realmente excluir este paciente? Todos os dados cadastrais serão removidos.')) return;
    try {
      const res = await fetch(`/api/patients?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchPatients();
      } else {
        alert(data.error || 'Erro ao excluir paciente.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  // Ações de Usuário (Médico Titular da Agenda & Colaboradores)
  function handleOpenUserModal(userToEdit?: any) {
    if (userToEdit) {
      setEditingUser(userToEdit);
      setUserName(userToEdit.name || '');
      setUserRole(userToEdit.role || 'SECRETARIA');
      setUserSpecialty(userToEdit.specialty || '');
      setUserCrm(userToEdit.crm || '');
      setUserCpf(userToEdit.cpf || '');
      setUserEmail(userToEdit.email || '');
      setUserPhone(userToEdit.phone || '');
      setUserLogin(userToEdit.login || '');
      setUserPassword(userToEdit.password || '');
      setUserPermissions(Array.isArray(userToEdit.permissions) ? userToEdit.permissions : []);
      setUserStatus(userToEdit.status || 'ACTIVE');
      setIsAutoLogin(false);
    } else {
      setEditingUser(null);
      setUserName('');
      const hasDoctor = users.some((u) => u.role === 'MEDICO');
      if (!hasDoctor) {
        setUserRole('MEDICO');
        setUserSpecialty('Pediatria');
        setUserCrm('CRM/SP 148.910');
        setUserPermissions(USER_PERMISSIONS.map((p) => p.id));
      } else {
        setUserRole('SECRETARIA');
        setUserSpecialty('Secretária Executiva');
        setUserCrm('');
        setUserPermissions([
          'visualizar_agenda',
          'bloquear_horario',
          'agendamento',
          'desmarcacao',
          'remarcacao',
          'agendamento_extra',
          'dados_paciente',
        ]);
      }
      setUserCpf('');
      setUserEmail('');
      setUserPhone('');
      setUserLogin('');
      setUserPassword('Acesso@2026');
      setUserStatus('ACTIVE');
      setIsAutoLogin(true);
    }
    setShowPassword(false);
    setShowModalUser(true);
  }

  function handleNameChange(newName: string) {
    setUserName(newName);
    if (isAutoLogin || !editingUser) {
      const generated = generateAutoLogin(newName, users, editingUser?.id);
      setUserLogin(generated);
    }
  }

  function handleRegenerateLogin() {
    const generated = generateAutoLogin(userName, users, editingUser?.id);
    setUserLogin(generated);
    setIsAutoLogin(true);
  }

  function handleGeneratePassword() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setUserPassword(`Med@${randomNum}!`);
    setShowPassword(true);
  }

  function applyPermissionPreset(preset: 'all' | 'secretary' | 'view_only' | 'none') {
    if (preset === 'all') {
      setUserPermissions(USER_PERMISSIONS.map((p) => p.id));
    } else if (preset === 'secretary') {
      setUserPermissions([
        'visualizar_agenda',
        'bloquear_horario',
        'agendamento',
        'desmarcacao',
        'remarcacao',
        'agendamento_extra',
        'dados_paciente',
      ]);
    } else if (preset === 'view_only') {
      setUserPermissions(['visualizar_agenda', 'dados_paciente']);
    } else {
      setUserPermissions([]);
    }
  }

  function togglePermission(permId: string) {
    setUserPermissions((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    if (!userName.trim()) {
      alert('Informe o Nome Completo.');
      return;
    }
    if (!userEmail.trim()) {
      alert('Informe o E-mail.');
      return;
    }

    try {
      const finalLogin = userLogin.trim() || generateAutoLogin(userName, users, editingUser?.id);

      const payload = {
        id: editingUser?.id,
        name: userName.trim(),
        role: userRole,
        specialty: userSpecialty.trim(),
        crm: userCrm.trim(),
        cpf: userCpf.trim(),
        email: userEmail.trim().toLowerCase(),
        phone: userPhone.trim(),
        login: finalLogin,
        password: userPassword,
        permissions: userPermissions,
        status: userStatus,
      };

      const method = editingUser ? 'PUT' : 'POST';
      const res = await fetch('/api/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowModalUser(false);
        fetchUsers();
        if (userRole === 'MEDICO') {
          fetch('/api/clinic/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              doctorName: userName.trim(),
              crm: userCrm.trim(),
              specialty: userSpecialty.trim(),
              email: userEmail.trim().toLowerCase(),
              phone: userPhone.trim(),
            }),
          }).then(() => fetchData()).catch(() => {});
        }
      } else {
        alert(data.error || 'Erro ao salvar usuário.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm('Deseja realmente remover o acesso deste usuário?')) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || 'Erro ao excluir usuário.');
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleToggleUserStatus(user: any) {
    try {
      const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      }
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/clinic/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clinic.name,
          doctorName: clinic.doctorName,
          specialty: clinic.specialty,
          crm: clinic.crm,
          email: clinic.email,
          phone: clinic.phone,
          address: clinic.address,
          slotDurationMinutes: clinic.slotDurationMinutes,
          minCancelHours: clinic.minCancelHours,
          workingHours: clinic.workingHours,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Perfil do Médico e configurações do consultório salvos com sucesso!');
        setClinic(data.clinic);
      }
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    }
  }

  // PERFIL DO MÉDICO RESPONSÁVEL DA AGENDA (Extraído do médico cadastrado em Usuários)
  const activeDoctor = useMemo(() => {
    // 1º Prioridade: O médico cadastrado na lista de usuários
    const doctorUser = users.find((u) => u.role === 'MEDICO');
    if (doctorUser) {
      return {
        name: doctorUser.name,
        specialty: doctorUser.specialty || 'Pediatria',
        crm: doctorUser.crm || clinic?.crm || 'CRM/SP 148.910',
        email: doctorUser.email,
        phone: doctorUser.phone || clinic?.phone || '(11) 98888-7777',
        room: 'Consultório Principal',
        address: clinic?.address || 'Av. Paulista, 1000',
      };
    }
    // Fallback: perfil das configurações da clínica
    return {
      name: clinic?.doctorName || 'Dra. Mariana Souza',
      specialty: clinic?.specialty || 'Pediatria',
      crm: clinic?.crm || 'CRM/SP 148.910',
      email: clinic?.email || 'dra.mariana@iterum.med.br',
      phone: clinic?.phone || '(11) 98888-7777',
      room: 'Consultório Principal',
      address: clinic?.address || 'Av. Paulista, 1000',
    };
  }, [users, clinic]);

  // Consultas do Dia Selecionado
  const selectedDayAppointments = useMemo(() => {
    return appointments
      .filter((a) => {
        const apptDate = new Date(a.startTime);
        return (
          apptDate.getFullYear() === selectedDate.getFullYear() &&
          apptDate.getMonth() === selectedDate.getMonth() &&
          apptDate.getDate() === selectedDate.getDate()
        );
      })
      .filter((a) => {
        const s = (a.status || '').toUpperCase();
        if (s === 'CONFIRMADO' || s === 'CONFIRMED') return filterConfirmed;
        if (s === 'AGENDADO' || s === 'SCHEDULED') return filterWaiting;
        if (s === 'REMARCADO' || s === 'RESCHEDULED') return filterEncaixe;
        if (s === 'CANCELADO' || s === 'CANCELED') return filterCanceled;
        return true;
      })
      .filter((a) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          a.patient?.name?.toLowerCase().includes(q) ||
          a.patient?.phone?.includes(q) ||
          (a.patient?.cpf && a.patient.cpf.includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [appointments, selectedDate, filterConfirmed, filterWaiting, filterEncaixe, filterCanceled, searchQuery]);

  // Contadores do Dia Selecionado
  const confirmedCount = useMemo(() => {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.toDateString() === selectedDate.toDateString() &&
        (a.status === 'CONFIRMADO' || a.status === 'CONFIRMED')
      );
    }).length;
  }, [appointments, selectedDate]);

  const waitingCount = useMemo(() => {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.toDateString() === selectedDate.toDateString() &&
        (a.status === 'AGENDADO' || a.status === 'SCHEDULED')
      );
    }).length;
  }, [appointments, selectedDate]);

  const encaixeCount = useMemo(() => {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.toDateString() === selectedDate.toDateString() &&
        (a.status === 'REMARCADO' || a.status === 'RESCHEDULED')
      );
    }).length;
  }, [appointments, selectedDate]);

  // Gerar dias do Mini-Calendário Mensal
  const miniCalendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{ dayNumber: number; inMonth: boolean; dateObj: Date }> = [];

    // Dias do mês anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      days.push({
        dayNumber: dayNum,
        inMonth: false,
        dateObj: new Date(year, month - 1, dayNum),
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        dayNumber: i,
        inMonth: true,
        dateObj: new Date(year, month, i),
      });
    }

    // Dias do próximo mês para completar 35 ou 42 células
    const remaining = 35 - days.length;
    if (remaining > 0) {
      for (let i = 1; i <= remaining; i++) {
        days.push({
          dayNumber: i,
          inMonth: false,
          dateObj: new Date(year, month + 1, i),
        });
      }
    }

    return days;
  }, [calendarMonth]);

  // Formatadores de data em Português
  const selectedDateHeader = useMemo(() => {
    const raw = selectedDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [selectedDate]);

  const monthLabel = useMemo(() => {
    const raw = calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [calendarMonth]);

  // Strip horizontal de dias para mobile
  const mobileDateStrip = useMemo(() => {
    const days: Date[] = [];
    for (let i = -3; i <= 6; i++) {
      const d = new Date(selectedDate);
      d.setDate(selectedDate.getDate() + i);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  function getApptCountForDate(targetDate: Date): number {
    return appointments.filter((a) => {
      const d = new Date(a.startTime);
      return (
        d.getFullYear() === targetDate.getFullYear() &&
        d.getMonth() === targetDate.getMonth() &&
        d.getDate() === targetDate.getDate()
      );
    }).length;
  }

  return (
    <div className="min-h-screen lg:h-screen w-full flex flex-col lg:flex-row overflow-x-hidden lg:overflow-hidden bg-[#f4f8f6] bg-[radial-gradient(ellipse_80%_60%_at_0%_0%,rgba(167,243,208,0.25),transparent_70%)] text-slate-800 font-sans select-none pb-16 lg:pb-0">
      {/* =========================================================================
          1. SIDEBAR DE NAVEGAÇÃO LATERAL (DESKTOP)
      ========================================================================= */}
      <aside className="hidden lg:flex w-72 border-r border-slate-200/80 bg-white flex-col justify-between shrink-0 z-30 shadow-xs">
        <div>
          {/* LOGO & SUITE */}
          <div className="p-4.5 flex items-center justify-between border-b border-slate-100 bg-white">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white border border-emerald-100 shadow-md shadow-emerald-900/5 p-1 flex items-center justify-center shrink-0">
                <img
                  src="/iterum-logo.jpg"
                  alt="Iterum"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-[#1e293b] leading-tight">Iterum</h1>
                <span className="text-[11px] font-extrabold text-[#005a43] block tracking-wide truncate">
                  Agenda {activeDoctor.name.toLowerCase().startsWith('dra') ? 'da ' : activeDoctor.name.toLowerCase().startsWith('dr') ? 'do ' : 'de '}{activeDoctor.name}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block truncate">
                  {activeDoctor.specialty}
                </span>
              </div>
            </div>
          </div>

          {/* MENU PRINCIPAL */}
          <nav className="px-3 space-y-1.5 mt-3">
            <button
              onClick={() => setActiveTab('agenda')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${
                activeTab === 'agenda'
                  ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <CalendarIcon className={`w-5 h-5 ${activeTab === 'agenda' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>Agenda</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === 'agenda' ? 'bg-[#005a43] text-white' : 'bg-[#e8f7f0] text-[#00875a]'
                }`}
              >
                {appointments.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('patients')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${
                activeTab === 'patients'
                  ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
              }`}
            >
              <Users className={`w-5 h-5 ${activeTab === 'patients' ? 'text-[#059669]' : 'text-slate-400'}`} />
              <span>Cadastro de Pacientes</span>
            </button>

            <button
              onClick={() => setActiveTab('fila')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${
                activeTab === 'fila'
                  ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Inbox className={`w-5 h-5 ${activeTab === 'fila' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>Encaixes</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></span>
            </button>

            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${
                activeTab === 'whatsapp'
                  ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <MessageSquare className={`w-5 h-5 ${activeTab === 'whatsapp' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>WhatsApp Bot</span>
              </div>
              <span className="text-[11px] text-[#00875a] font-bold bg-[#e8f7f0] px-2 py-0.5 rounded-full border border-[#d1fae5]">
                Online
              </span>
            </button>

            {/* SEÇÃO GESTÃO */}
            <div className="pt-4 pb-1 px-4">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Acesso & Consultório</span>
            </div>

            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${
                activeTab === 'users'
                  ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
              }`}
            >
              <div className="flex items-center gap-3">
                <UserCheck className={`w-5 h-5 ${activeTab === 'users' ? 'text-[#059669]' : 'text-slate-400'}`} />
                <span>Usuários & Acessos</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {users.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 ${
                activeTab === 'settings'
                  ? 'bg-[#e8f7f0] text-[#00875a] font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#f3f9f5]'
              }`}
            >
              <Settings className={`w-5 h-5 ${activeTab === 'settings' ? 'text-[#059669]' : 'text-slate-400'}`} />
              <span>Perfil & Expediente</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* =========================================================================
          MOBILE DRAWER (OFF-CANVAS SIDEBAR)
      ========================================================================= */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-4/5 max-w-xs bg-white shadow-2xl flex flex-col justify-between z-50 p-4 animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-emerald-100 shadow-sm p-1 flex items-center justify-center shrink-0">
                    <img
                      src="/iterum-logo.jpg"
                      alt="Iterum"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h1 className="text-base font-extrabold tracking-tight text-slate-900 leading-tight">Iterum</h1>
                    <span className="text-[11px] font-extrabold text-[#005a43] block mt-0.5 truncate">
                      Agenda {activeDoctor.name.toLowerCase().startsWith('dra') ? 'da ' : activeDoctor.name.toLowerCase().startsWith('dr') ? 'do ' : 'de '}{activeDoctor.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium block truncate">
                      {activeDoctor.specialty}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 font-bold rounded-xl hover:bg-slate-100"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* MENU PRINCIPAL */}
              <nav className="space-y-1.5 mt-4">
                <button
                  onClick={() => {
                    setActiveTab('agenda');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition ${
                    activeTab === 'agenda'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CalendarIcon className={`w-5 h-5 ${activeTab === 'agenda' ? 'text-teal-400' : 'text-slate-500'}`} />
                    <span>Agenda</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                      activeTab === 'agenda' ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-700'
                    }`}
                  >
                    {appointments.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('patients');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition ${
                    activeTab === 'patients'
                      ? 'bg-slate-900 text-white shadow-md font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-5 h-5 text-slate-500" />
                  <span>Cadastro de Pacientes</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('fila');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition ${
                    activeTab === 'fila'
                      ? 'bg-slate-900 text-white shadow-md font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Inbox className="w-5 h-5 text-slate-500" />
                    <span>Encaixes</span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse"></span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('whatsapp');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition ${
                    activeTab === 'whatsapp'
                      ? 'bg-slate-900 text-white shadow-md font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-slate-500" />
                    <span>WhatsApp & Lembretes</span>
                  </div>
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Cloud
                  </span>
                </button>

                <div className="pt-4 pb-1 px-4">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Acesso & Consultório</span>
                </div>

                <button
                  onClick={() => {
                    setActiveTab('users');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition ${
                    activeTab === 'users'
                      ? 'bg-slate-900 text-white shadow-md font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-slate-500" />
                    <span>Usuários & Acessos</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {users.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition ${
                    activeTab === 'settings'
                      ? 'bg-slate-900 text-white shadow-md font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Settings className="w-5 h-5 text-slate-500" />
                  <span>Perfil & Expediente</span>
                </button>
              </nav>
            </div>
          </aside>
        </div>
      )}

      {/* =========================================================================
          2. ÁREA PRINCIPAL (HEADER + CONTEÚDO)
      ========================================================================= */}
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {/* =========================================================================
            HEADER MOBILE (lg:hidden)
        ========================================================================= */}
        {activeTab !== 'agenda' && (
          <header className="lg:hidden bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 px-3 py-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white border border-emerald-100 p-0.5 flex items-center justify-center shadow-xs">
                  <img src="/iterum-logo.jpg" alt="Iterum" className="w-full h-full object-contain" />
                </div>
                <div>
                  <span className="font-extrabold text-xs text-slate-900 tracking-tight leading-none block">Iterum</span>
                  <span className="text-[10px] text-[#005a43] font-bold tracking-tight block truncate max-w-[160px]">
                    Agenda {activeDoctor.name.toLowerCase().startsWith('dra') ? 'da ' : activeDoctor.name.toLowerCase().startsWith('dr') ? 'do ' : 'de '}{activeDoctor.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                className={`p-2 rounded-xl transition ${
                  mobileSearchOpen ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                aria-label="Buscar"
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setNewApptTime('');
                  setShowModalNewAppt(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Novo</span>
              </button>
            </div>
          </div>

          {/* BUSCA EXPANSÍVEL NO MOBILE */}
          {mobileSearchOpen && (
            <div className="mt-2.5 pt-2 border-t border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar paciente, CPF ou procedimento..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-100 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 border border-slate-200 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </header>
        )}

        {/* HEADER SUPERIOR DESKTOP (ESTILO CAREHUB) */}
        {activeTab !== 'agenda' && (
          <header className="hidden lg:flex h-20 px-8 bg-transparent items-center justify-between gap-6 shrink-0 z-20">
            {/* BUSCADOR ARREDONDADO CAREHUB */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              <input
                type="text"
                placeholder="Search patients, ID, records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white border border-[#e5efe9] text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#10b981]/20 focus:border-[#10b981] shadow-2xs transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* CONTROLES DIREITOS: SINO COM BADGE 3 E PERFIL DO MÉDICO CAREHUB */}
            <div className="flex items-center space-x-3.5">
              {/* Sino de Notificação */}
              <div className="relative p-2.5 rounded-full bg-white border border-[#e5efe9] hover:bg-slate-50 text-slate-600 transition cursor-pointer shadow-2xs">
                <Bell className="w-4.5 h-4.5 text-slate-600" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs">
                  3
                </span>
              </div>

              {/* Perfil do Médico Estilo CareHub */}
              <div
                onClick={() => setActiveTab('settings')}
                className="flex items-center space-x-3 pl-2 py-1.5 pr-3 cursor-pointer bg-white border border-[#e5efe9] hover:border-[#10b981]/40 rounded-full shadow-2xs transition group"
              >
                <div className="w-9 h-9 rounded-full bg-[#005a43] text-white font-bold flex items-center justify-center text-xs shadow-xs">
                  {getInitials(activeDoctor.name)}
                </div>
                <div className="text-left hidden xl:block">
                  <span className="block text-xs font-black text-[#1e293b] leading-tight group-hover:text-[#005a43] transition">
                    {activeDoctor.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {activeDoctor.specialty?.split('•')[0] || 'Médico Responsável'}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
              </div>
            </div>
          </header>
        )}

        {/* NOTIFICAÇÃO CRON */}
        {cronNotice && (
          <div className="bg-teal-50 border-b border-teal-200 px-4 sm:px-6 py-2 text-xs text-teal-900 flex items-center justify-between font-medium">
            <span>{cronNotice}</span>
            <button onClick={() => setCronNotice(null)} className="text-teal-700 hover:text-slate-900 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* =========================================================================
            3. CONTEÚDO DINÂMICO CONFORME ABA SELECIONADA
        ========================================================================= */}
        <main className={`flex-1 flex flex-col ${activeTab === 'agenda' ? 'p-0' : 'p-3.5 sm:p-4 lg:p-6 lg:flex-row gap-4 lg:gap-6'} overflow-y-auto lg:overflow-hidden`}>
          {/* ---------------------------------------------------------------------
              ABA: AGENDA MÉDICA (EXPERIÊNCIA GOOGLE CALENDAR COMPLETA)
          --------------------------------------------------------------------- */}
          {activeTab === 'agenda' && (
            <div className="flex-1 flex flex-col h-full min-h-0 bg-white overflow-hidden">
              <GoogleCalendarView
                appointments={appointments}
                clinic={clinic}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                agendaViewMode={agendaViewMode}
                setAgendaViewMode={setAgendaViewMode}
                currentTimeStr={currentTimeStr}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onOpenNewAppt={openNewApptModalWithSlot}
                onOpenApptDetails={(appt) => setSelectedApptDetails(appt)}
                onSwitchTab={(tab) => setActiveTab(tab)}
                activeDoctor={activeDoctor}
              />
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: PACIENTES & PRONTUÁRIO (DESIGN DOCFLOW)
          --------------------------------------------------------------------- */}
          {activeTab === 'patients' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 flex flex-col overflow-hidden">
              <div className="pb-3.5 sm:pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-[#1e293b] tracking-tight">Cadastro de Pacientes</h2>
                  <p className="text-sm text-slate-400 font-medium mt-0.5">Fichas cadastrais e informações de contato (dados protegidos)</p>
                </div>
                <button
                  onClick={() => handleOpenPatientModal()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md shadow-slate-900/15 transition active:scale-95"
                >
                  <UserPlus className="w-4 h-4 stroke-[2.5]" />
                  <span>Cadastrar Paciente</span>
                </button>
              </div>

              {/* LISTAGEM DE CARDS EM MOBILE (< md) */}
              <div className="md:hidden flex-1 overflow-y-auto space-y-3 mt-3.5">
                {patients.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 font-medium text-sm">Nenhum paciente cadastrado</div>
                ) : (
                  patients.map((p) => (
                    <div key={p.id} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-11 h-11 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-extrabold text-sm shrink-0">
                            {getInitials(p.name)}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-base leading-tight">{p.name}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              {p.cpf ? `CPF: ${applyCPFMask(p.cpf)}` : 'Sem CPF'} • {p.birthDate ? calculateAge(p.birthDate) : 'Idade N/D'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleOpenPatientModal(p)}
                            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-2xs hover:bg-slate-100"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePatient(p.id)}
                            className="p-2 rounded-xl bg-white border border-rose-200 text-rose-600 shadow-2xs hover:bg-rose-50"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                        <a
                          href={`https://wa.me/${(p.phone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-emerald-800 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs shadow-2xs"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          {formatPhoneBR(p.phone)}
                        </a>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200/80 text-slate-700">
                          {p._count?.appointments ?? 1} consultas
                        </span>
                      </div>

                      {p.notes && (
                        <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* TABELA DE PACIENTES EM DESKTOP (>= md) */}
              <div className="hidden md:block flex-1 overflow-y-auto mt-4">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Paciente / CPF</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Contato</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Idade</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Consultas</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs">Observações</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patients.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3.5">
                          <div className="flex items-center space-x-3.5">
                            <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-extrabold text-sm shadow-2xs">
                              {getInitials(p.name)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5">
                                {p.cpf ? `CPF: ${applyCPFMask(p.cpf)}` : 'CPF não informado'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-mono font-bold text-slate-800 text-sm">{formatPhoneBR(p.phone)}</div>
                          {p.email && <div className="text-xs text-slate-400 mt-0.5">{p.email}</div>}
                        </td>
                        <td className="p-3.5 font-medium text-slate-700 text-sm">
                          {p.birthDate ? calculateAge(p.birthDate) : '—'}
                        </td>
                        <td className="p-3.5">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {p._count?.appointments ?? 1} consulta(s)
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 text-xs max-w-xs truncate">{p.notes || '—'}</td>
                        <td className="p-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleOpenPatientModal(p)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePatient(p.id)}
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: FILA DE ESPERA & ENCAIXE
          --------------------------------------------------------------------- */}
          {activeTab === 'fila' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/70 shadow-xs p-3.5 sm:p-6 flex flex-col overflow-y-auto">
              <div className="pb-3 sm:pb-4 border-b border-slate-100">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <Inbox className="w-5 h-5 text-sky-600" />
                  Fila de Espera & Encaixes Inteligentes
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Pacientes aguardando antecipação de horário com disparo automático via WhatsApp
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 my-4 sm:my-6">
                <div className="p-4 sm:p-5 rounded-2xl bg-sky-50/60 border border-sky-100">
                  <span className="text-xs font-bold text-sky-900 block">Pacientes na Fila</span>
                  <span className="text-2xl font-extrabold text-sky-950 mt-1 block">4</span>
                  <span className="text-[11px] text-sky-700 mt-1 block">Prioridade por ordem de solicitação</span>
                </div>
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                  <span className="text-xs font-bold text-emerald-900 block">Tempo Médio de Resposta</span>
                  <span className="text-2xl font-extrabold text-emerald-950 mt-1 block">4 min</span>
                  <span className="text-[11px] text-emerald-700 mt-1 block">Aceite instantâneo via botão de WhatsApp</span>
                </div>
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/70">
                  <span className="text-xs font-bold text-slate-900 block">Vagas Recuperadas este Mês</span>
                  <span className="text-2xl font-extrabold text-slate-950 mt-1 block">18 vagas</span>
                  <span className="text-[11px] text-slate-500 mt-1 block">0% de ociosidade por faltas</span>
                </div>
              </div>

              <div className="flex-1 p-5 sm:p-6 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                <Zap className="w-10 h-10 text-sky-500 stroke-1 mb-2" />
                <h3 className="text-sm font-bold text-slate-800">Motor de Recuperação de Faltas Ativo</h3>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Quando uma consulta for cancelada ou remarcada pelo WhatsApp, o CliniDesk aciona automaticamente os pacientes da lista de espera com opções interativas de [SIM / NÃO].
                </p>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: WHATSAPP & LEMBRETES
          --------------------------------------------------------------------- */}
          {activeTab === 'whatsapp' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/70 shadow-xs p-3.5 sm:p-6 flex flex-col overflow-y-auto">
              <div className="pb-3 sm:pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-emerald-600" />
                    WhatsApp & Automação de Lembretes
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Integração Oficial Meta Cloud API (v26.0) • Disparos automáticos e interativos
                  </p>
                </div>
                <button
                  onClick={handleTriggerCronReminders}
                  disabled={cronRunning}
                  className="px-3.5 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 active:scale-95"
                >
                  <Clock className={`w-3.5 h-3.5 ${cronRunning ? 'animate-spin' : ''}`} />
                  <span>{cronRunning ? 'Disparando...' : 'Testar Disparo 24h'}</span>
                </button>
              </div>

              <div className="my-4 sm:my-6 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Meta WhatsApp Cloud API Ativa
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Instância conectada com sucesso ao número oficial da clínica. Suporte a botões interativos e IA determinística do POP.
                  </p>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/70">
                  <span className="text-xs font-bold text-slate-900 block">Lembretes das Próximas 24 Horas</span>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Cron automático configurado para checar a cada 30 minutos e notificar pacientes com antecedência mínima de 24 horas.
                  </p>
                </div>
              </div>

              <div className="flex-1 p-4 sm:p-6 rounded-2xl bg-slate-50/50 border border-slate-200/60 overflow-y-auto">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-3">
                  Últimas Notificações Registradas
                </span>
                <div className="space-y-2 text-xs">
                  {appointments.slice(0, 5).map((a) => (
                    <div key={a.id} className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-slate-800 truncate">{a.patient?.name}</span>
                        <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">{formatPhoneBR(a.patient?.phone)}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        Entregue
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: USUÁRIOS & PERMISSÕES DE ACESSO (PERFIL ÚNICO DO MÉDICO)
          --------------------------------------------------------------------- */}
          {activeTab === 'users' && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 flex flex-col overflow-hidden">
              {/* CABEÇALHO DA ABA */}
              <div className="pb-3.5 sm:pb-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Cadastro de Usuários & Acessos</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-[#005a43] uppercase tracking-wide">
                      Perfil Único
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                    Cadastre o(a) médico(a) titular da agenda e os colaboradores de apoio (secretárias, recepção)
                  </p>
                </div>
                <button
                  onClick={() => handleOpenUserModal()}
                  className="px-4.5 py-2.5 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-[#005a43]/15 transition active:scale-95 flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>+ Cadastrar Usuário</span>
                </button>
              </div>

              {/* BANNER INFORMATIVO: CONTEXTO PERFIL ÚNICO */}
              <div className="my-3.5 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-slate-50 border border-emerald-200 flex items-start sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#005a43] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div className="text-xs leading-relaxed text-slate-700">
                    <div className="flex items-center gap-1.5 font-extrabold text-slate-900 mb-0.5">
                      <span>Titular Atual da Agenda:</span>
                      <span className="text-[#005a43]">{activeDoctor.name}</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-100 text-[#005a43] font-bold">
                        {activeDoctor.specialty} • {activeDoctor.crm}
                      </span>
                    </div>
                    <span className="text-slate-500 block">
                      O sistema identifica o dono da agenda através do usuário com o perfil <strong>Médico(a) Titular</strong>. Ao cadastrar ou editar esse usuário, o nome de toda a agenda (Ex: <em>Agenda da Dra. Mariana - Pediatra</em>) atualiza automaticamente.
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const doc = users.find((u) => u.role === 'MEDICO');
                    if (doc) handleOpenUserModal(doc);
                    else handleOpenUserModal();
                  }}
                  className="shrink-0 px-3.5 py-1.5 rounded-xl bg-white border border-emerald-300 text-[#005a43] hover:bg-emerald-50 text-xs font-bold transition shadow-2xs"
                >
                  Editar Médico Titular
                </button>
              </div>

              {/* BARRA DE PESQUISA & ESTATÍSTICAS */}
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Buscar por nome, login, CPF ou e-mail..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                  />
                  {userSearch && (
                    <button
                      onClick={() => setUserSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium">Total cadastrados:</span>
                  <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    {users.length} usuários
                  </span>
                </div>
              </div>

              {/* LISTAGEM DE CARDS EM MOBILE (< md) */}
              <div className="md:hidden flex-1 overflow-y-auto space-y-3">
                {users
                  .filter((u) => {
                    if (!userSearch.trim()) return true;
                    const q = userSearch.toLowerCase();
                    return (
                      u.name?.toLowerCase().includes(q) ||
                      u.login?.toLowerCase().includes(q) ||
                      u.email?.toLowerCase().includes(q) ||
                      u.cpf?.includes(q) ||
                      u.phone?.includes(q)
                    );
                  })
                  .map((u) => {
                    const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
                    const isDoctor = u.role === 'MEDICO';
                    return (
                      <div
                        key={u.id}
                        className={`p-4 rounded-2xl border space-y-3 transition ${
                          isDoctor
                            ? 'bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white border-emerald-300 shadow-xs ring-1 ring-emerald-300/50'
                            : 'bg-slate-50/80 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-slate-900 text-base">{u.name}</span>
                              {isDoctor && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-[#005a43] border border-emerald-300 flex items-center gap-1">
                                  ⭐ Médico Titular
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-[#005a43] bg-emerald-100/60 px-2 py-0.5 rounded-md">
                                @{u.login || 'sem_login'}
                              </span>
                              <span className="text-xs text-slate-700 font-semibold">
                                {u.specialty || (isDoctor ? 'Pediatria' : u.role)}
                              </span>
                              {isDoctor && u.crm && (
                                <span className="text-xs text-slate-500 font-mono">
                                  • {u.crm}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleUserStatus(u)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition shrink-0 ${
                              u.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {u.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                          </button>
                        </div>

                        <div className="space-y-1 text-xs text-slate-600">
                          {u.cpf && <div><strong>CPF:</strong> {u.cpf}</div>}
                          <div><strong>E-mail:</strong> <span className="font-mono">{u.email}</span></div>
                          {u.phone && <div><strong>Celular:</strong> {u.phone}</div>}
                        </div>

                        {/* PERMISSÕES RESUMO */}
                        <div className="pt-2 border-t border-slate-200/60">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-bold text-slate-700">Permissões de Acesso:</span>
                            <span className="font-bold text-[#005a43]">{perms.length} de 9 ativas</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {perms.map((pId) => {
                              const permObj = USER_PERMISSIONS.find((p) => p.id === pId);
                              return (
                                <span
                                  key={pId}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700"
                                >
                                  {permObj?.label || pId}
                                </span>
                              );
                            })}
                            {perms.length === 0 && (
                              <span className="text-xs text-amber-600 italic">Nenhuma permissão concedida</span>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200/60">
                          <button
                            onClick={() => handleOpenUserModal(u)}
                            className="py-1.5 px-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs hover:bg-slate-100"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="py-1.5 px-3.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-xs font-bold shadow-2xs hover:bg-rose-50"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* TABELA DE USUÁRIOS EM DESKTOP (>= md) */}
              <div className="hidden md:block flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm border-separate border-spacing-0">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Usuário & Login</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Especialidade / Função</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Contato & CPF</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Permissões de Acesso</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs border-b border-slate-200">Status</th>
                      <th className="p-3.5 uppercase tracking-wider text-xs text-right border-b border-slate-200">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users
                      .filter((u) => {
                        if (!userSearch.trim()) return true;
                        const q = userSearch.toLowerCase();
                        return (
                          u.name?.toLowerCase().includes(q) ||
                          u.login?.toLowerCase().includes(q) ||
                          u.email?.toLowerCase().includes(q) ||
                          u.cpf?.includes(q) ||
                          u.phone?.includes(q)
                        );
                      })
                      .map((u) => {
                        const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
                        const isDoctor = u.role === 'MEDICO';
                        return (
                          <tr
                            key={u.id}
                            className={`transition ${
                              isDoctor ? 'bg-emerald-50/50 hover:bg-emerald-50/80 font-medium' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 block text-sm">{u.name}</span>
                                {isDoctor && (
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-[#005a43] border border-emerald-300 flex items-center gap-1 shadow-2xs">
                                    ⭐ Titular da Agenda
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-xs font-extrabold text-[#005a43] bg-emerald-50 border border-emerald-200/80 px-2 py-0.2 rounded-md">
                                  @{u.login || 'sem_login'}
                                </span>
                              </div>
                            </td>
                            <td className="p-3.5">
                              <span className={`block text-xs ${isDoctor ? 'font-extrabold text-[#005a43]' : 'font-semibold text-slate-800'}`}>
                                {u.specialty || (isDoctor ? 'Pediatria' : 'Secretária')}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {isDoctor ? (u.crm ? `CRM: ${u.crm}` : 'Médico Responsável') : (u.role === 'ADMIN' ? 'Administrador' : 'Operador do sistema')}
                              </span>
                            </td>
                            <td className="p-3.5 text-xs">
                              <span className="font-mono text-slate-700 block">{u.email}</span>
                              <span className="text-slate-500 font-medium block">
                                {u.phone ? formatPhone(u.phone) : 'Sem celular'} {u.cpf ? `• CPF: ${u.cpf}` : ''}
                              </span>
                            </td>
                            <td className="p-3.5 max-w-xs">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-xs font-bold text-slate-800">
                                  {perms.length} de 9 liberadas
                                </span>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {perms.slice(0, 3).map((pId) => {
                                  const p = USER_PERMISSIONS.find((item) => item.id === pId);
                                  return (
                                    <span
                                      key={pId}
                                      className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 truncate max-w-[120px]"
                                    >
                                      {p?.label || pId}
                                    </span>
                                  );
                                })}
                                {perms.length > 3 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-[#005a43] border border-emerald-200">
                                    +{perms.length - 3} mais
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <button
                                onClick={() => handleToggleUserStatus(u)}
                                className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition ${
                                  u.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                }`}
                              >
                                {u.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                              </button>
                            </td>
                            <td className="p-3.5 text-right space-x-1.5">
                              <button
                                onClick={() => handleOpenUserModal(u)}
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                title="Editar Usuário e Permissões"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------------
              ABA: CONFIGURAÇÕES & PERFIL DO MÉDICO (PERFIL ÚNICO)
          --------------------------------------------------------------------- */}
          {activeTab === 'settings' && clinic && (
            <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-xs p-4 sm:p-6 overflow-y-auto">
              <div className="pb-3.5 sm:pb-4 border-b border-slate-100 mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-[#005a43]" />
                    Perfil Único do Médico & Configurações
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                    Defina o médico responsável pela agenda, especialidade, CRM e regras de expediente
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-[#005a43] border border-emerald-200">
                  Sistema de Médico Único
                </span>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl text-sm">
                {/* SEÇÃO 1: PERFIL DO MÉDICO RESPONSÁVEL */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/40 to-slate-50/70 border border-emerald-100 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-emerald-200/60">
                    <Stethoscope className="w-4.5 h-4.5 text-[#005a43]" />
                    <h3 className="font-extrabold text-slate-900 text-sm">Dados do Médico Titular</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">Nome Completo do Médico</label>
                      <input
                        type="text"
                        required
                        value={clinic.doctorName || clinic.name || ''}
                        onChange={(e) => setClinic({ ...clinic, doctorName: e.target.value, name: e.target.value })}
                        placeholder="Ex: Dr. Renato Silva"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">CRM / Registro Profissional</label>
                      <input
                        type="text"
                        value={clinic.crm || ''}
                        onChange={(e) => setClinic({ ...clinic, crm: e.target.value })}
                        placeholder="Ex: CRM/SP 148.910"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">Especialidade Médica</label>
                    <input
                      type="text"
                      required
                      value={clinic.specialty || ''}
                      onChange={(e) => setClinic({ ...clinic, specialty: e.target.value })}
                      placeholder="Ex: Cardiologia, Pediatria, Dermatologia..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[11px] font-bold text-slate-400">Sugestões rápidas:</span>
                      {['Cardiologia', 'Pediatria', 'Dermatologia', 'Clínica Geral', 'Ginecologia', 'Ortopedia', 'Oftalmologia'].map((esp) => (
                        <button
                          key={esp}
                          type="button"
                          onClick={() => setClinic({ ...clinic, specialty: esp })}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 hover:border-[#005a43] text-slate-600 transition"
                        >
                          {esp}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">E-mail Profissional</label>
                      <input
                        type="email"
                        value={clinic.email || ''}
                        onChange={(e) => setClinic({ ...clinic, email: e.target.value })}
                        placeholder="contato@medico.med.br"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">Celular / WhatsApp do Consultório</label>
                      <input
                        type="text"
                        value={clinic.phone || ''}
                        onChange={(e) => setClinic({ ...clinic, phone: e.target.value })}
                        placeholder="(11) 98888-7777"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1 text-xs">Consultório / Sala / Endereço</label>
                    <input
                      type="text"
                      value={clinic.address || ''}
                      onChange={(e) => setClinic({ ...clinic, address: e.target.value })}
                      placeholder="Ex: Av. Paulista, 1000 - Conjunto 402 - Bela Vista, SP"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43] bg-white"
                    />
                  </div>
                </div>

                {/* SEÇÃO 2: PARÂMETROS DA AGENDA */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Clock className="w-4.5 h-4.5 text-[#005a43]" />
                    <h3 className="font-extrabold text-slate-900 text-sm">Parâmetros das Consultas</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">Duração Padrão da Consulta (minutos)</label>
                      <input
                        type="number"
                        min="10"
                        step="5"
                        value={clinic.slotDurationMinutes || 30}
                        onChange={(e) => setClinic({ ...clinic, slotDurationMinutes: parseInt(e.target.value) || 30 })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-800 mb-1 text-xs">Antecedência Mínima para Cancelamento (horas)</label>
                      <input
                        type="number"
                        min="1"
                        value={clinic.minCancelHours || 2}
                        onChange={(e) => setClinic({ ...clinic, minCancelHours: parseInt(e.target.value) || 2 })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-7 py-3 bg-[#005a43] hover:bg-[#004735] text-white font-bold rounded-xl shadow-md shadow-[#005a43]/15 transition active:scale-95 text-sm flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Perfil do Médico & Parâmetros</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================================
          BARRA DE NAVEGAÇÃO INFERIOR MOBILE (iOS / Android TabBar)
      ========================================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#e5efe9] z-40 px-2 py-1.5 flex items-center justify-around shadow-lg pb-safe">
        <button
          onClick={() => setActiveTab('agenda')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
            activeTab === 'agenda' ? 'text-[#00875a] font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
          }`}
        >
          <div className="relative">
            <CalendarIcon className="w-5 h-5" />
            {appointments.length > 0 && (
              <span className="absolute -top-1 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-[#00875a] text-white">
                {appointments.length}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5">Agenda</span>
        </button>

        <button
          onClick={() => setActiveTab('patients')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
            activeTab === 'patients' ? 'text-[#00875a] font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Pacientes</span>
        </button>

        <button
          onClick={() => setActiveTab('fila')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
            activeTab === 'fila' ? 'text-teal-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <div className="relative">
            <Inbox className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
          </div>
          <span className="text-[10px] mt-0.5">Encaixes</span>
        </button>

        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
            activeTab === 'whatsapp' ? 'text-teal-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <div className="relative">
            <MessageSquare className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <span className="text-[10px] mt-0.5">WhatsApp</span>
        </button>
      </nav>

      {/* FAB: NOVA CONSULTA (MOBILE) */}
      {activeTab !== 'agenda' && (
      <button
        onClick={() => {
          setNewApptTime('');
          setShowModalNewAppt(true);
        }}
        className="lg:hidden fixed right-4 bottom-20 z-40 bg-slate-900 hover:bg-slate-800 text-white rounded-full p-3.5 shadow-xl shadow-slate-900/30 flex items-center gap-1.5 font-bold text-xs active:scale-95 transition"
        aria-label="Nova Consulta"
      >
        <Plus className="w-4 h-4 stroke-[2.5]" />
        <span className="pr-1">Consulta</span>
      </button>
      )}

      {/* MODAL / BOTTOM SHEET MOBILE DE FILTROS & CALENDÁRIO */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end sm:items-center justify-center">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto z-10 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-teal-600" />
                Calendário & Filtros da Agenda
              </h3>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* MINI CALENDÁRIO MENSAL */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">{monthLabel}</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      const m = new Date(calendarMonth);
                      m.setMonth(m.getMonth() - 1);
                      setCalendarMonth(m);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const m = new Date(calendarMonth);
                      m.setMonth(m.getMonth() + 1);
                      setCalendarMonth(m);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-600"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* GRID DO MÊS */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                <span className="text-[10px] font-bold text-slate-400">D</span>
                <span className="text-[10px] font-bold text-slate-400">S</span>
                <span className="text-[10px] font-bold text-slate-400">T</span>
                <span className="text-[10px] font-bold text-slate-400">Q</span>
                <span className="text-[10px] font-bold text-slate-400">Q</span>
                <span className="text-[10px] font-bold text-slate-400">S</span>
                <span className="text-[10px] font-bold text-slate-400">S</span>

                {miniCalendarDays.map((item, idx) => {
                  const isSelected = item.dateObj.toDateString() === selectedDate.toDateString();
                  const isToday = item.dateObj.toDateString() === new Date().toDateString();

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDate(item.dateObj);
                        setMobileFiltersOpen(false);
                      }}
                      className={`h-7 w-7 mx-auto rounded-xl flex items-center justify-center text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-slate-900 text-white font-bold shadow-xs'
                          : isToday
                          ? 'border border-teal-500 text-teal-700 font-bold'
                          : item.inMonth
                          ? 'text-slate-800 hover:bg-slate-200'
                          : 'text-slate-300'
                      }`}
                    >
                      {item.dayNumber}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FILTROS DE STATUS */}
            <div className="space-y-2 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Filtrar por Status
              </span>
              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterConfirmed}
                  onChange={(e) => setFilterConfirmed(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-bold text-slate-800 flex-1">Confirmados ({confirmedCount})</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterWaiting}
                  onChange={(e) => setFilterWaiting(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-bold text-slate-800 flex-1">Aguardando ({waitingCount})</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterEncaixe}
                  onChange={(e) => setFilterEncaixe(e.target.checked)}
                  className="rounded text-sky-500 focus:ring-sky-400 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span className="font-bold text-slate-800 flex-1">Encaixe Confirmado ({encaixeCount})</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl bg-slate-50 border border-slate-200/60">
                <input
                  type="checkbox"
                  checked={filterCanceled}
                  onChange={(e) => setFilterCanceled(e.target.checked)}
                  className="rounded text-rose-500 focus:ring-rose-400 h-4 w-4 border-slate-300"
                />
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="font-bold text-slate-800 flex-1">Cancelados</span>
              </label>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => {
                  setFilterConfirmed(true);
                  setFilterWaiting(true);
                  setFilterEncaixe(true);
                  setFilterCanceled(false);
                  setSearchQuery('');
                }}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
              >
                Limpar Filtros
              </button>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="flex-1 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          4. MODAL: NOVA CONSULTA
      ========================================================================= */}
      {showModalNewAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-teal-600" />
                Agendar Nova Consulta
              </h3>
              <button onClick={() => setShowModalNewAppt(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Paciente Cadastrado *</label>
                <select
                  required
                  value={selectedPatientId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedPatientId(id);
                    const p = patients.find((x) => x.id === id);
                    if (p) {
                      setNewApptName(p.name);
                      setNewApptPhone(p.phone);
                    } else {
                      setNewApptName('');
                      setNewApptPhone('');
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                >
                  <option value="">-- Selecione um Paciente Cadastrado --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.cpf ? `(CPF: ${applyCPFMask(p.cpf)})` : ''} — {formatPhoneBR(p.phone)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Data e Horário *</label>
                <input
                  type="datetime-local"
                  required
                  value={newApptTime}
                  onChange={(e) => setNewApptTime(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Procedimento / Observações</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Retorno cardiológico, check-up preventivo..."
                  value={newApptNotes}
                  onChange={(e) => setNewApptNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalNewAppt(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedPatientId}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-xs disabled:opacity-40"
                >
                  Confirmar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          5. MODAL: DETALHES / PRONTUÁRIO RÁPIDO
      ========================================================================= */}
      {selectedApptDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                Detalhes do Agendamento
              </h3>
              <button onClick={() => setSelectedApptDetails(null)} className="text-slate-400 hover:text-slate-700 font-bold p-1">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Paciente</span>
                <p className="font-bold text-slate-900 text-sm">{selectedApptDetails.patient?.name}</p>
                <p className="text-slate-600 font-mono">{formatPhoneBR(selectedApptDetails.patient?.phone)}</p>
                {selectedApptDetails.patient?.cpf && (
                  <p className="text-slate-500 font-mono text-[11px]">CPF: {applyCPFMask(selectedApptDetails.patient.cpf)}</p>
                )}
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Horário Marcado</span>
                <p className="font-bold text-slate-800">
                  {new Date(selectedApptDetails.startTime).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} às{' '}
                  {new Date(selectedApptDetails.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-slate-500">Status atual: <span className="font-bold text-slate-800">{getStatusLabel(selectedApptDetails.status)}</span></p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Observações Cadastrais (Horários e Preferências)</span>
                <p className="text-slate-700 leading-relaxed font-medium">{selectedApptDetails.notes || 'Nenhuma anotação inserida.'}</p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedApptDetails(null)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          6. MODAL: NOVO / EDITAR PACIENTE
      ========================================================================= */}
      {showModalPatient && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Contact className="w-4 h-4 text-teal-600" />
                {editingPatient ? 'Editar Paciente' : 'Novo Cadastro de Paciente'}
              </h3>
              <button onClick={() => setShowModalPatient(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePatient} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={patName}
                  onChange={(e) => setPatName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone (WhatsApp) *</label>
                  <input
                    type="text"
                    required
                    value={patPhone}
                    onChange={(e) => setPatPhone(applyPhoneMask(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CPF</label>
                  <input
                    type="text"
                    value={patCpf}
                    onChange={(e) => setPatCpf(applyCPFMask(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-mono font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  value={patEmail}
                  onChange={(e) => setPatEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações / Alergias</label>
                <textarea
                  rows={2}
                  value={patNotes}
                  onChange={(e) => setPatNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalPatient(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-xs"
                >
                  Salvar Paciente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          7. MODAL: NOVO / EDITAR USUÁRIO & CONTROLE DE PERMISSÕES
      ========================================================================= */}
      {showModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-100 space-y-5 my-auto max-h-[92vh] flex flex-col">
            {/* CABEÇALHO DO MODAL */}
            <div className="flex items-start justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-[#005a43] flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                    {editingUser ? 'Editar Usuário & Permissões' : 'Cadastrar Novo Usuário'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Preencha os dados e defina o que o operador poderá fazer no aplicativo do médico
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModalUser(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* FORMULÁRIO COM SCROLL INTERNO */}
            <form onSubmit={handleSaveUser} className="space-y-5 overflow-y-auto flex-1 pr-1 text-xs">
              {/* BLOCO 1: DADOS PESSOAIS E PROFISSIONAIS */}
              <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                  1. Perfil & Identificação do Usuário
                </span>

                {/* SELETOR DE FUNÇÃO / PAPEL */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Função no Sistema <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUserRole('MEDICO');
                        if (!userSpecialty || userSpecialty.includes('Secretária')) setUserSpecialty('Pediatria');
                        if (!userCrm) setUserCrm('CRM/SP 148.910');
                        applyPermissionPreset('all');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                        userRole === 'MEDICO'
                          ? 'bg-emerald-50 border-[#005a43] ring-2 ring-[#005a43]/20 text-[#005a43] shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs">
                        <span>⭐</span>
                        <span>Médico(a) Titular</span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Dono da agenda no aplicativo
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUserRole('SECRETARIA');
                        if (userSpecialty === 'Pediatria') setUserSpecialty('Secretária Executiva');
                        applyPermissionPreset('secretary');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                        userRole === 'SECRETARIA'
                          ? 'bg-emerald-50 border-[#005a43] ring-2 ring-[#005a43]/20 text-[#005a43] shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>📋</span>
                        <span>Secretária / Recepção</span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Operador de consultas
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUserRole('ADMIN');
                        applyPermissionPreset('all');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                        userRole === 'ADMIN'
                          ? 'bg-emerald-50 border-[#005a43] ring-2 ring-[#005a43]/20 text-[#005a43] shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>🛡️</span>
                        <span>Administrador</span>
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">
                        Acesso irrestrito
                      </span>
                    </button>
                  </div>

                  {userRole === 'MEDICO' && (
                    <div className="mt-2.5 p-3 rounded-xl bg-emerald-100/70 border border-emerald-300 text-emerald-950 text-xs flex items-start gap-2.5">
                      <span className="text-base shrink-0">⭐</span>
                      <div>
                        <strong>Titular da Agenda:</strong> O sistema vai reconhecer de quem é a agenda a partir deste médico (Ex: <em>Marcação de consultas • {userName || 'Dra. Mariana'} ({userSpecialty || 'Pediatra'})</em>).
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nome Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={userName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={userRole === 'MEDICO' ? 'Ex: Dra. Mariana Souza' : 'Ex: Juliana Rocha Santos'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {userRole === 'MEDICO' ? 'Especialidade Médica *' : 'Especialidade / Função *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={userSpecialty}
                      onChange={(e) => setUserSpecialty(e.target.value)}
                      placeholder={userRole === 'MEDICO' ? 'Ex: Pediatria, Cardiologia...' : 'Ex: Secretária Executiva, Recepção...'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(userRole === 'MEDICO'
                        ? ['Pediatria', 'Cardiologia', 'Dermatologia', 'Ginecologia', 'Ortopedia', 'Clínica Geral']
                        : ['Secretária Executiva', 'Recepção', 'Atendimento', 'Gestão']
                      ).map((esp) => (
                        <button
                          key={esp}
                          type="button"
                          onClick={() => setUserSpecialty(esp)}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-[#005a43] text-slate-600 transition"
                        >
                          {esp}
                        </button>
                      ))}
                    </div>
                  </div>

                  {userRole === 'MEDICO' ? (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        CRM / Registro Profissional <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={userCrm}
                        onChange={(e) => setUserCrm(e.target.value)}
                        placeholder="Ex: CRM/SP 148.910"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Exibido nos cabeçalhos e confirmações.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        CPF <span className="text-slate-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={userCpf}
                        onChange={(e) => setUserCpf(formatCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {userRole === 'MEDICO' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        CPF <span className="text-slate-400 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="text"
                        value={userCpf}
                        onChange={(e) => setUserCpf(formatCPF(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      E-mail <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder={userRole === 'MEDICO' ? 'dra.mariana@consultorio.med.br' : 'usuario@consultorio.med.br'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Celular / WhatsApp <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={userPhone}
                      onChange={(e) => setUserPhone(formatPhone(e.target.value))}
                      placeholder="(11) 98888-8888"
                      maxLength={15}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-medium text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                    />
                  </div>
                </div>
              </div>

              {/* BLOCO 2: CREDENCIAIS DE ACESSO (LOGIN GERADO AUTOMATICAMENTE E SENHA) */}
              <div className="space-y-3.5 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                  2. Acesso ao Sistema
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* CAMPO LOGIN */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700">
                        Login (Nome + iniciais sobrenome) <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleRegenerateLogin}
                        className="text-[10px] font-bold text-[#005a43] hover:underline flex items-center gap-1"
                        title="Recalcular login a partir do nome"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Gerar</span>
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold">@</span>
                      <input
                        type="text"
                        required
                        value={userLogin}
                        onChange={(e) => {
                          setUserLogin(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                          setIsAutoLogin(false);
                        }}
                        placeholder="login_unico"
                        className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-slate-200 font-mono font-bold text-xs bg-white text-[#005a43] focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Gerado automaticamente com nome e iniciais do sobrenome (único).
                    </p>
                  </div>

                  {/* CAMPO SENHA */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700">
                        Senha <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        className="text-[10px] font-bold text-teal-700 hover:underline flex items-center gap-1"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Gerar Senha</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#005a43]/20 focus:border-[#005a43]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Senha provisória de acesso ao aplicativo.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="font-bold text-slate-700 text-xs">Status da Conta:</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUserStatus('ACTIVE')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                        userStatus === 'ACTIVE'
                          ? 'bg-emerald-100 text-[#005a43] border border-emerald-300'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      ✓ Ativo
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserStatus('INACTIVE')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                        userStatus === 'INACTIVE'
                          ? 'bg-slate-200 text-slate-800 border border-slate-300'
                          : 'bg-white border border-slate-200 text-slate-500'
                      }`}
                    >
                      Inativo
                    </button>
                  </div>
                </div>
              </div>

              {/* BLOCO 3: PERMISSÕES DE ACESSO (AS 9 OPÇÕES) */}
              <div className="space-y-3 p-4 rounded-2xl bg-gradient-to-br from-emerald-50/40 via-teal-50/20 to-slate-50 border border-emerald-100">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-emerald-200/60">
                  <div>
                    <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider block">
                      3. Permissões de Acesso no Perfil
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Escolha exatamente o que este usuário poderá fazer no aplicativo:
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#005a43] bg-emerald-100 px-2 py-0.5 rounded-md">
                    {userPermissions.length} de 9 selecionadas
                  </span>
                </div>

                {/* BOTÕES DE PRESETS RÁPIDOS */}
                <div className="flex flex-wrap items-center gap-1.5 pb-2">
                  <span className="text-[10px] font-bold text-slate-400">Atalhos rápidos:</span>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('secretary')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 text-[#005a43] transition"
                  >
                    ⚡ Perfil Secretária (Recepção)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('all')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition"
                  >
                    👑 Acesso Total
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('view_only')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition"
                  >
                    👁️ Somente Consulta
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset('none')}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-500 transition"
                  >
                    🧹 Limpar
                  </button>
                </div>

                {/* GRID COM AS 9 OPÇÕES */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {USER_PERMISSIONS.map((perm) => {
                    const isChecked = userPermissions.includes(perm.id);
                    return (
                      <div
                        key={perm.id}
                        onClick={() => togglePermission(perm.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition select-none flex items-start gap-2.5 ${
                          isChecked
                            ? 'bg-white border-[#005a43] shadow-xs'
                            : 'bg-white/60 border-slate-200 hover:border-slate-300 opacity-80'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="mt-0.5 w-4 h-4 rounded text-[#005a43] focus:ring-[#005a43] border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={`font-bold text-xs block ${
                              isChecked ? 'text-slate-900' : 'text-slate-700'
                            }`}
                          >
                            {perm.label}
                          </span>
                          <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
                            {perm.description}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalUser(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#005a43] hover:bg-[#004735] text-white rounded-xl font-bold shadow-md shadow-[#005a43]/15 transition active:scale-95 text-xs flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Usuário & Permissões</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
