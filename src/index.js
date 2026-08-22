require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');
const { initializeDatabase } = require('./database/db');
const { initializeCA } = require('./services/ca');
const { getRequiredEnv } = require('./config/security');
const {
  createDatabaseSessionStore,
  getSessionCookieConfig
} = require('./services/session-store');
const { startEmailQueueWorker } = require('./services/email-queue');
const { emailService } = require('./services/email');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const certificateRoutes = require('./routes/certificates');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 6723;
const APP_HOST = process.env.APP_HOST || '0.0.0.0';
const sessionSecret = getRequiredEnv('SESSION_SECRET');

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

initializeDatabase().then(({ models }) => {
  console.log('Banco de dados inicializado com sucesso');

  app.use(session({
    secret: sessionSecret,
    store: createDatabaseSessionStore({
      sessionModel: models.Session,
      ttlMs: Number(process.env.SESSION_MAX_AGE_MS || 24 * 60 * 60 * 1000)
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: getSessionCookieConfig()
  }));

  app.use((req, res, next) => {
    if (req.secure) {
      req.session.cookie.secure = true;
    }
    next();
  });

  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.requireNameCorrection = Boolean(req.session.requireNameCorrection);
    next();
  });

  startEmailQueueWorker({
    deliveryModel: models.EmailDelivery,
    emailService,
    intervalMs: Number(process.env.EMAIL_QUEUE_INTERVAL_MS || 3000)
  });
  
  return initializeCA();
}).then(() => {
  console.log('Autoridade Certificadora (CA) inicializada com sucesso');
  
  app.use('/', authRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/certificates', certificateRoutes);
  
  app.get('/', (req, res) => {
    if (req.session.user) {
      return res.redirect('/dashboard');
    }
    res.render('index', { title: 'ZeroCert - Simulador ICP-Brasil' });
  });
  
  function generateSSLCertificate() {
    const sslDir = process.env.SSL_DIRECTORY || 'src/ssl';
    const certPath = path.join(__dirname, '..', sslDir, 'cert.pem');
    const keyPath = path.join(__dirname, '..', sslDir, 'key.pem');
    const daysValid = process.env.SSL_DAYS_VALID || 365;
    const commonName = process.env.SSL_COMMON_NAME || 'localhost';
    const organization = process.env.SSL_ORGANIZATION || 'ZeroCert';
    const organizationalUnit = process.env.SSL_ORGANIZATIONAL_UNIT || 'Dev';
    const country = process.env.SSL_COUNTRY || 'BR';
    const state = process.env.SSL_STATE || 'DF';
    const locality = process.env.SSL_LOCALITY || 'Brasilia';
    const domains = (process.env.SSL_DOMAINS || 'localhost').split(',');
    const ips = (process.env.SSL_IPS || '127.0.0.1').split(',');
    
    const sslDirPath = path.join(__dirname, '..', sslDir);
    if (!fs.existsSync(sslDirPath)) {
      fs.mkdirSync(sslDirPath, { recursive: true });
    }
    
    if (fs.existsSync(certPath)) {
      fs.unlinkSync(certPath);
      console.log(`Certificado antigo removido: ${certPath}`);
    }
    
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
      console.log(`Chave privada antiga removida: ${keyPath}`);
    }
    
    let sanExtensions = '';
    domains.forEach(domain => {
      sanExtensions += `DNS:${domain.trim()},`;
    });
    
    ips.forEach(ip => {
      sanExtensions += `IP:${ip.trim()},`;
    });
    
    sanExtensions = sanExtensions.slice(0, -1);
    
    const opensslCommand = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days ${daysValid} -nodes -subj "/CN=${commonName}/O=${organization}/OU=${organizationalUnit}/C=${country}/ST=${state}/L=${locality}" -addext "subjectAltName=${sanExtensions}"`;
    
    try {
      console.log('Gerando novo certificado SSL com OpenSSL...');
      execSync(opensslCommand);
      console.log(`Certificado SSL gerado com sucesso em ${certPath}`);
      console.log(`Chave privada gerada com sucesso em ${keyPath}`);
      
      return { certPath, keyPath };
    } catch (error) {
      console.error('Erro ao gerar certificado SSL:', error.message);
      throw error;
    }
  }
  if (require.main === module) {
    try {
      const { certPath, keyPath } = generateSSLCertificate();
      
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      
      app.listen(HTTP_PORT, APP_HOST, () => {
        console.log(`Servidor HTTP rodando na porta ${HTTP_PORT}`);
        console.log(`Acesse: http://localhost:${HTTP_PORT}`);
      });
      
      https.createServer(httpsOptions, app).listen(HTTPS_PORT, APP_HOST, () => {
        console.log(`Servidor HTTPS rodando na porta ${HTTPS_PORT}`);
        console.log(`Acesse: https://localhost:${HTTPS_PORT}`);
      });
    } catch (error) {
      console.error('Falha ao configurar HTTPS:', error);
      
      app.listen(HTTP_PORT, APP_HOST, () => {
        console.log(`Servidor HTTP rodando na porta ${HTTP_PORT} (HTTPS falhou)`);
        console.log(`Acesse: http://localhost:${HTTP_PORT}`);
      });
    }
  }
}).catch(err => {
  console.error('Erro ao inicializar o aplicativo:', err);
});
