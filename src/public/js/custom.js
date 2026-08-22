document.addEventListener('DOMContentLoaded', function() {
  const themeStorageKey = 'zerocert-theme';
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;

  function applyTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', normalizedTheme);

    if (themeIcon) {
      themeIcon.classList.toggle('bi-moon-stars', normalizedTheme === 'light');
      themeIcon.classList.toggle('bi-sun', normalizedTheme === 'dark');
    }

    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', normalizedTheme === 'dark' ? 'true' : 'false');
      themeToggle.setAttribute('title', normalizedTheme === 'dark' ? 'Alternar modo claro' : 'Alternar modo noturno');
    }
  }

  applyTheme(document.documentElement.getAttribute('data-bs-theme'));

  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      const currentTheme = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(themeStorageKey, nextTheme);
      applyTheme(nextTheme);
    });
  }

  var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // Inicializa popovers do Bootstrap
  var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
  var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
    return new bootstrap.Popover(popoverTriggerEl);
  });

  // Efeito de digitação para elementos com a classe .terminal-typing
  const terminalElements = document.querySelectorAll('.terminal-typing');
  terminalElements.forEach(element => {
    const text = element.textContent;
    element.textContent = '';
    let i = 0;
    const typing = setInterval(() => {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(typing);
      }
    }, 50);
  });

  // Função para copiar texto para a área de transferência
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach(button => {
    button.addEventListener('click', function() {
      const textToCopy = this.getAttribute('data-copy');
      navigator.clipboard.writeText(textToCopy).then(() => {
        // Altera o texto do botão temporariamente
        const originalText = this.textContent;
        this.textContent = 'Copiado!';
        setTimeout(() => {
          this.textContent = originalText;
        }, 2000);
      });
    });
  });

  // Função para alternar visibilidade de senha
  const togglePasswordButtons = document.querySelectorAll('.toggle-password');
  togglePasswordButtons.forEach(button => {
    button.addEventListener('click', function() {
      const passwordField = document.querySelector(this.getAttribute('data-target'));
      const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordField.setAttribute('type', type);
      
      // Alterna o ícone
      this.querySelector('i').classList.toggle('fa-eye');
      this.querySelector('i').classList.toggle('fa-eye-slash');
    });
  });

  // Confirmação para ações destrutivas
  const confirmActions = document.querySelectorAll('[data-confirm]');
  confirmActions.forEach(element => {
    element.addEventListener('click', function(e) {
      const message = this.getAttribute('data-confirm');
      if (!confirm(message)) {
        e.preventDefault();
      }
    });
  });

  // Validação de formulários
  const forms = document.querySelectorAll('.needs-validation');
  forms.forEach(form => {
    form.addEventListener('submit', function(event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    }, false);
  });

  // Verificação de correspondência de senhas
  const passwordFields = document.querySelectorAll('.password-match');
  const confirmFields = document.querySelectorAll('.confirm-password');
  
  if (passwordFields.length > 0 && confirmFields.length > 0) {
    confirmFields.forEach((confirmField, index) => {
      confirmField.addEventListener('input', function() {
        const password = passwordFields[index].value;
        const confirmPassword = this.value;
        
        if (password !== confirmPassword) {
          this.setCustomValidity('As senhas não correspondem');
        } else {
          this.setCustomValidity('');
        }
      });
    });
  }

  // Auto-fechamento de alertas
  const autoCloseAlerts = document.querySelectorAll('.alert-dismissible.auto-close');
  autoCloseAlerts.forEach(alert => {
    setTimeout(() => {
      const closeButton = alert.querySelector('.btn-close');
      if (closeButton) {
        closeButton.click();
      } else {
        alert.style.display = 'none';
      }
    }, 5000); // Fecha após 5 segundos
  });

  // Tornar linhas de tabela clicáveis
  const clickableRows = document.querySelectorAll('tr[data-href]');
  clickableRows.forEach(row => {
    row.addEventListener('click', function() {
      window.location.href = this.getAttribute('data-href');
    });
    row.style.cursor = 'pointer';
  });

  // Contador de caracteres para textareas
  const textareas = document.querySelectorAll('textarea[maxlength]');
  textareas.forEach(textarea => {
    const maxLength = textarea.getAttribute('maxlength');
    const counterElement = document.createElement('small');
    counterElement.classList.add('text-muted', 'character-counter');
    counterElement.textContent = `0/${maxLength} caracteres`;
    textarea.parentNode.insertBefore(counterElement, textarea.nextSibling);
    
    textarea.addEventListener('input', function() {
      const currentLength = this.value.length;
      counterElement.textContent = `${currentLength}/${maxLength} caracteres`;
      
      if (currentLength >= maxLength * 0.9) {
        counterElement.classList.add('text-danger');
      } else {
        counterElement.classList.remove('text-danger');
      }
    });
  });

  // Mostrar/ocultar campos condicionais
  const conditionalTriggers = document.querySelectorAll('[data-toggle-field]');
  conditionalTriggers.forEach(trigger => {
    trigger.addEventListener('change', function() {
      const targetSelector = this.getAttribute('data-toggle-field');
      const targetField = document.querySelector(targetSelector);
      
      if (targetField) {
        if (this.checked || this.value === 'true' || this.value === '1') {
          targetField.style.display = 'block';
        } else {
          targetField.style.display = 'none';
        }
      }
    });
    
    // Trigger inicial
    trigger.dispatchEvent(new Event('change'));
  });

  // Funções para formatação de CPF e CNPJ
  function formatCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    cpf = cpf.replace(/([\d]{3})([\d]{3})([\d]{3})([\d]{2})/, '$1.$2.$3-$4');
    return cpf;
  }

  function formatCNPJ(cnpj) {
    cnpj = cnpj.replace(/\D/g, '');
    cnpj = cnpj.replace(/([\d]{2})([\d]{3})([\d]{3})([\d]{4})([\d]{2})/, '$1.$2.$3/$4-$5');
    return cnpj;
  }

  // Aplicar máscaras de CPF e CNPJ
  const cpfInputs = document.querySelectorAll('.cpf-mask');
  cpfInputs.forEach(input => {
    input.addEventListener('input', function() {
      this.value = formatCPF(this.value);
    });
  });

  const cnpjInputs = document.querySelectorAll('.cnpj-mask');
  cnpjInputs.forEach(input => {
    input.addEventListener('input', function() {
      this.value = formatCNPJ(this.value);
    });
  });

  // Validação de CPF
  function isValidCPF(cpf) {
    cpf = cpf.replace(/[^\d]/g, '');
    
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    
    let remainder = sum % 11;
    let digit1 = remainder < 2 ? 0 : 11 - remainder;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    
    remainder = sum % 11;
    let digit2 = remainder < 2 ? 0 : 11 - remainder;
    
    return digit1 === parseInt(cpf.charAt(9)) && digit2 === parseInt(cpf.charAt(10));
  }

  // Validação de CNPJ
  function isValidCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]/g, '');
    
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    
    // Validação do primeiro dígito
    let size = cnpj.length - 2;
    let numbers = cnpj.substring(0, size);
    const digits = cnpj.substring(size);
    let sum = 0;
    let pos = size - 7;
    
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return false;
    
    // Validação do segundo dígito
    size = size + 1;
    numbers = cnpj.substring(0, size);
    sum = 0;
    pos = size - 7;
    
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    
    return result === parseInt(digits.charAt(1));
  }

  // Aplicar validação de CPF e CNPJ nos campos
  const cpfValidationInputs = document.querySelectorAll('.validate-cpf');
  cpfValidationInputs.forEach(input => {
    input.addEventListener('blur', function() {
      const cpf = this.value.replace(/[^\d]/g, '');
      if (cpf.length > 0 && !isValidCPF(cpf)) {
        this.setCustomValidity('CPF inválido');
        this.classList.add('is-invalid');
      } else {
        this.setCustomValidity('');
        this.classList.remove('is-invalid');
      }
    });
  });

  const cnpjValidationInputs = document.querySelectorAll('.validate-cnpj');
  cnpjValidationInputs.forEach(input => {
    input.addEventListener('blur', function() {
      const cnpj = this.value.replace(/[^\d]/g, '');
      if (cnpj.length > 0 && !isValidCNPJ(cnpj)) {
        this.setCustomValidity('CNPJ inválido');
        this.classList.add('is-invalid');
      } else {
        this.setCustomValidity('');
        this.classList.remove('is-invalid');
      }
    });
  });
});
