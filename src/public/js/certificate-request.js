document.addEventListener('DOMContentLoaded', function() {
  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function hasRepeatedDigits(value) {
    return /^(\d)\1+$/.test(value);
  }

  function maskCpf(value) {
    const digits = onlyDigits(value).slice(0, 11);

    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  function maskCnpj(value) {
    const digits = onlyDigits(value).slice(0, 14);

    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  }

  function maskPis(value) {
    const digits = onlyDigits(value).slice(0, 11);

    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{5})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{5})\.(\d{2})(\d)/, '$1.$2.$3-$4');
  }

  function validateCpf(value) {
    const cpf = onlyDigits(value);

    if (cpf.length !== 11 || hasRepeatedDigits(cpf)) {
      return false;
    }

    let sum = 0;

    for (let index = 0; index < 9; index += 1) {
      sum += Number(cpf[index]) * (10 - index);
    }

    const firstDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);

    if (firstDigit !== Number(cpf[9])) {
      return false;
    }

    sum = 0;

    for (let index = 0; index < 10; index += 1) {
      sum += Number(cpf[index]) * (11 - index);
    }

    const secondDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);

    return secondDigit === Number(cpf[10]);
  }

  function validateCnpj(value) {
    const cnpj = onlyDigits(value);

    if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) {
      return false;
    }

    function digit(length) {
      let sum = 0;
      let position = length - 7;

      for (let index = length; index >= 1; index -= 1) {
        sum += Number(cnpj[length - index]) * position;
        position -= 1;

        if (position < 2) {
          position = 9;
        }
      }

      return sum % 11 < 2 ? 0 : 11 - (sum % 11);
    }

    return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
  }

  function validatePis(value) {
    const pis = onlyDigits(value);
    const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    if (!pis) {
      return true;
    }

    if (pis.length !== 11 || hasRepeatedDigits(pis)) {
      return false;
    }

    const sum = weights.reduce(function(total, weight, index) {
      return total + Number(pis[index]) * weight;
    }, 0);
    const remainder = 11 - (sum % 11);
    const digit = remainder === 10 || remainder === 11 ? 0 : remainder;

    return digit === Number(pis[10]);
  }

  function parseDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
      return null;
    }

    const parts = value.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) {
      return null;
    }

    return {
      year: parts[0],
      month: parts[1],
      day: parts[2]
    };
  }

  function isValidBirthDate(value) {
    const birthDate = parseDateOnly(value);

    if (!birthDate) {
      return false;
    }

    const currentDate = new Date();
    let age = currentDate.getFullYear() - birthDate.year;
    const currentMonth = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();

    if (currentMonth < birthDate.month || (currentMonth === birthDate.month && currentDay < birthDate.day)) {
      age -= 1;
    }

    return age >= 16 && age < 100;
  }

  function bindMaskedValidation(selector, mask, validate, message) {
    document.querySelectorAll(selector).forEach(function(input) {
      function apply() {
        input.value = mask(input.value);

        if (!onlyDigits(input.value)) {
          input.setCustomValidity('');
          input.classList.remove('is-invalid');
          return;
        }

        const valid = validate(input.value);
        input.setCustomValidity(valid ? '' : message);
        input.classList.toggle('is-invalid', !valid && Boolean(input.value));
      }

      input.addEventListener('input', apply);
      input.addEventListener('blur', apply);
      apply();
    });
  }

  document.querySelectorAll('.birth-date-validation').forEach(function(input) {
    function apply() {
      if (!input.value) {
        input.setCustomValidity('');
        input.classList.remove('is-invalid');
        return;
      }

      const valid = isValidBirthDate(input.value);
      input.setCustomValidity(valid ? '' : 'Data de nascimento inválida');
      input.classList.toggle('is-invalid', !valid && Boolean(input.value));
    }

    input.addEventListener('input', apply);
    input.addEventListener('change', apply);
    input.addEventListener('blur', apply);
    apply();
  });

  bindMaskedValidation('.cpf-mask.validate-cpf', maskCpf, validateCpf, 'CPF inválido');
  bindMaskedValidation('.cnpj-mask.validate-cnpj', maskCnpj, validateCnpj, 'CNPJ inválido');
  bindMaskedValidation('.pis-mask.validate-pis', maskPis, validatePis, 'PIS/PASEP/NIS inválido');

  document.querySelectorAll('.certificate-request-form').forEach(function(form) {
    form.addEventListener('submit', function(event) {
      form.querySelectorAll('input').forEach(function(input) {
        input.dispatchEvent(new Event('blur'));
      });

      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
        form.reportValidity();
      }

      form.classList.add('was-validated');
    });
  });
});
