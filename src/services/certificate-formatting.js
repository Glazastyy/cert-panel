function humanizeUsageName(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCertificateUsage(value) {
  if (Array.isArray(value)) {
    const formatted = value.map(humanizeUsageName).filter(Boolean);

    return formatted.length > 0 ? formatted.join(', ') : 'Não disponível';
  }

  if (value && typeof value === 'object') {
    const formatted = Object.entries(value)
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => humanizeUsageName(name))
      .filter(Boolean);

    return formatted.length > 0 ? formatted.join(', ') : 'Não disponível';
  }

  const formatted = humanizeUsageName(value);

  return formatted || 'Não disponível';
}

module.exports = {
  formatCertificateUsage
};
