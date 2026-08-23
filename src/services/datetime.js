const DISPLAY_TIME_ZONE = 'America/Sao_Paulo';

function parseDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnlyString(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDate(value) {
  const dateOnly = formatDateOnlyString(value);

  if (dateOnly) {
    return dateOnly;
  }

  const date = parseDate(value);

  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: DISPLAY_TIME_ZONE
  }).format(date);
}

function formatDateTime(value) {
  const date = parseDate(value);

  if (!date) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: DISPLAY_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

module.exports = {
  DISPLAY_TIME_ZONE,
  formatDate,
  formatDateTime
};
