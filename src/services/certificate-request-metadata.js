const PAYLOAD_LABELS = {
  name: 'Nome Completo',
  cpf: 'CPF',
  birthDate: 'Data de Nascimento',
  socialSecurity: 'PIS/PASEP/NIS',
  email: 'E-mail',
  state: 'Estado',
  city: 'Cidade',
  companyName: 'Razão Social',
  cnpj: 'CNPJ',
  tradeName: 'Nome Fantasia',
  responsibleName: 'Responsável Legal',
  responsibleCpf: 'CPF do Responsável',
  responsiblePosition: 'Cargo do Responsável',
  responsibleBirthDate: 'Data de Nascimento do Responsável'
};

const METADATA_LABELS = {
  submittedAt: 'Enviada em',
  ip: 'IP',
  forwardedFor: 'X-Forwarded-For',
  realIp: 'X-Real-IP',
  userAgent: 'Agente',
  device: 'Dispositivo',
  language: 'Idioma',
  referer: 'Referer',
  origin: 'Origem',
  method: 'Método',
  path: 'Caminho'
};

function header(req, name) {
  if (!req || typeof req.get !== 'function') {
    return '';
  }

  return String(req.get(name) || '').trim();
}

function detectDevice(userAgent) {
  const value = String(userAgent || '').toLowerCase();

  if (!value) {
    return 'Desconhecido';
  }

  if (/(bot|crawler|spider|crawling)/.test(value)) {
    return 'Bot';
  }

  if (/(ipad|tablet|playbook|silk)/.test(value) || (/android/.test(value) && !/mobile/.test(value))) {
    return 'Tablet';
  }

  if (/(mobi|iphone|ipod|android|windows phone)/.test(value)) {
    return 'Mobile';
  }

  return 'Desktop';
}

function buildCertificateRequestMetadata(req, now = () => new Date()) {
  const userAgent = header(req, 'user-agent');

  return {
    submittedAt: now().toISOString(),
    ip: String(req.ip || '').trim(),
    forwardedFor: header(req, 'x-forwarded-for'),
    realIp: header(req, 'x-real-ip'),
    userAgent,
    device: detectDevice(userAgent),
    language: header(req, 'accept-language'),
    referer: header(req, 'referer'),
    origin: header(req, 'origin'),
    method: String(req.method || '').trim(),
    path: String(req.originalUrl || req.url || '').trim()
  };
}

function normalizeDisplayValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatRows(source, labels) {
  return Object.entries(source || {})
    .filter(([key]) => key !== 'metadata')
    .map(([key, value]) => [
      labels[key] || key,
      normalizeDisplayValue(value)
    ]);
}

function formatCertificateRequestPayload(payload) {
  return formatRows(payload, PAYLOAD_LABELS);
}

function formatCertificateRequestMetadata(metadata) {
  return formatRows(metadata, METADATA_LABELS);
}

module.exports = {
  buildCertificateRequestMetadata,
  detectDevice,
  formatCertificateRequestMetadata,
  formatCertificateRequestPayload
};
