# ZeroCert - Simulador de ICP-Brasil para Testes

O ZeroCert é um sistema que simula a Infraestrutura de Chaves Públicas Brasileira (ICP-Brasil) para emissão de certificados digitais em ambiente de teste. Este projeto permite a criação e gerenciamento de certificados digitais no padrão ICP-Brasil, como e-CPF e e-CNPJ, para fins de desenvolvimento e testes.

## Características

- Criação e gerenciamento de Autoridades Certificadoras (AC)
- Emissão de certificados e-CPF e e-CNPJ seguindo as normas da ICP-Brasil
- Interface web estilizada para parecer sistemas legados
- Validação de certificados por número de série
- Revogação de certificados
- Download de certificados nos formatos PEM e PKCS#12 (P12)
- Banco de dados PostgreSQL para armazenamento
- Migração segura a partir do banco SQLite legado
- Suporte a HTTPS com certificados SSL autoassinados

## Requisitos

- Bun 1.x ou superior
- OpenSSL (para geração de certificados SSL)

## Instalação

1. Clone o repositório:
   ```
   git clone https://github.com/Glazastyy/cert-panel.git
   cd cert-panel
   ```

2. Instale as dependências:
   ```
   bun install
   ```

3. Configure as variáveis de ambiente:
   Crie um arquivo `.env` na raiz do projeto com as seguintes configurações:
   ```
   # Configurações do Certificado SSL
   SSL_COMMON_NAME=localhost
   SSL_ORGANIZATION=ZeroCert Certificados e Identidade Digital
   SSL_ORGANIZATIONAL_UNIT=Desenvolvimento
   SSL_COUNTRY=BR
   SSL_STATE=DF
   SSL_LOCALITY=Brasilia
   SSL_DAYS_VALID=365
   SSL_DIRECTORY=src/ssl
   SSL_DOMAINS=localhost
   SSL_IPS=127.0.0.1
   HTTP_PORT=3000
   HTTPS_PORT=3443

   # Configurações da Aplicação (opcionais)
   # SESSION_SECRET=sua_chave_secreta_para_sessoes
   # SESSION_MAX_AGE_MS=86400000
   # DB_PATH=src/data/database.sqlite
   # DB_DIALECT=postgres
   # DB_HOST=localhost
   # DB_PORT=5432
   # DB_NAME=zerocert
   # DB_USER=zerocert
   # DB_PASSWORD=sua_senha_segura

   # Configurações de E-mail (SMTP ou Resend)
   # EMAIL_PROVIDER=smtp
   # SMTP_HOST=smtp.example.com
   # SMTP_PORT=587
   # SMTP_SECURE=false
   # SMTP_USER=usuario_smtp
   # SMTP_PASSWORD=senha_smtp
   # RESEND_API_KEY=re_xxxxxxxxx
   # EMAIL_FROM=ZeroCert <no-reply@seudominio.com>
   ```
   
   **Importante**: Certifique-se de que o diretório especificado em `SSL_DIRECTORY` existe e tem permissões de escrita. O sistema irá gerar automaticamente os certificados SSL necessários para HTTPS neste diretório.

4. Inicie o servidor:
   ```
   bun run start
   ```

5. Acesse a aplicação em seu navegador:
   ```
   http://localhost:3000   # Acesso HTTP
   https://localhost:3443  # Acesso HTTPS (certificado autoassinado)
   ```
   
   **Nota**: Ao acessar via HTTPS, seu navegador poderá exibir um aviso de segurança devido ao certificado autoassinado. Isso é esperado em ambiente de desenvolvimento.

## Estrutura do Projeto

```
├── src/
│   ├── data/            # Local de armazenamento do banco de dados
│   ├── database/        # Configuração do banco de dados
│   ├── models/          # Modelos de dados
│   ├── public/          # Arquivos estáticos (CSS, JS, imagens)
│   ├── routes/          # Rotas da aplicação
│   ├── services/        # Serviços de negócio
│   ├── ssl/             # Certificados SSL gerados
│   ├── views/           # Templates Pug
│   └── index.js         # Ponto de entrada da aplicação
├── .env                 # Variáveis de ambiente
├── docker-compose.yml
├── package.json
└── README.md
```

## PostgreSQL em Container

1. Rode o assistente para criar ou revisar o `.env`:
   ```
   ./rebuild.sh init
   ```

   Ele pergunta as configurações principais e gera chaves aleatórias quando `SESSION_SECRET`, `POSTGRES_PASSWORD` ou `DB_PASSWORD` ainda não existem.

2. Suba o Postgres e a aplicação web:
   ```
   ./rebuild.sh up
   ```

3. Acesse a aplicação:
   ```
   http://localhost:3000
   https://localhost:3443
   ```

O `docker-compose.yml` sobe automaticamente o banco, aguarda o healthcheck do PostgreSQL e só então inicia a aplicação web. Para ambiente local, o Compose usa valores padrão, incluindo a senha `local-test`. Em produção, defina ao menos `POSTGRES_PASSWORD`, `DB_PASSWORD`, `APP_HTTP_PORT`, `APP_HTTPS_PORT`, `EMAIL_PROVIDER`, `EMAIL_FROM` e as variáveis do provedor de e-mail escolhido no `.env`.

Comandos úteis:

```
./rebuild.sh config
./rebuild.sh update
./rebuild.sh reboot
./rebuild.sh status
./rebuild.sh logs
./rebuild.sh down
./rebuild.sh migrate
./rebuild.sh migrate /caminho/para/database.sqlite
```

Use `config` para revisar configurações, `update` para executar `git pull --ff-only` e rebuild, `reboot` para reconstruir e reiniciar a web, `status` para ver os containers, `logs` para acompanhar logs em tempo real, `down` para parar os containers e `migrate` para migrar o SQLite legado para PostgreSQL. O comando `migrate` usa `SQLITE_DB_PATH` do `.env` quando nenhum caminho é informado, ou o arquivo passado no argumento quando chamado como `./rebuild.sh migrate /caminho/para/database.sqlite`.

Se precisar rodar a aplicação fora do Compose, configure:
   ```
   DB_DIALECT=postgres
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=zerocert
   DB_USER=zerocert
   DB_PASSWORD=sua_senha_segura
   ```

## Migração de SQLite para PostgreSQL

Antes da migração, pare a aplicação em produção para evitar novas escritas no SQLite durante a cópia.

1. Faça backup do SQLite atual:
   ```
   cp src/data/database.sqlite src/data/database.sqlite.backup
   ```

2. Suba um Postgres vazio:
   ```
   bun run db:postgres:up
   ```

3. Execute a migração:
   ```
   SQLITE_DB_PATH=src/data/database.sqlite DB_DIALECT=postgres DB_HOST=localhost DB_PORT=5432 DB_NAME=zerocert DB_USER=zerocert DB_PASSWORD=sua_senha_segura bun run db:migrate:sqlite-to-postgres
   ```

4. Verifique o resumo impresso pelo script e só então inicie a aplicação apontando para Postgres.

O script preserva IDs, relacionamentos, certificados, usuários, autoridades certificadoras e solicitações. Por padrão, ele aborta se o destino já tiver registros, evitando misturar dados de uma migração parcial com dados existentes.

## Uso

### Primeiro Acesso

Ao iniciar a aplicação pela primeira vez, um usuário administrador padrão será criado:

- **Usuário**: admin
- **Senha**: admin123

Recomenda-se alterar a senha após o primeiro login.

### Emissão de Certificados

1. Faça login no sistema
2. Acesse o menu "Certificados" e selecione "Emitir e-CPF" ou "Emitir e-CNPJ"
3. Preencha os dados solicitados
4. Defina uma senha para o certificado
5. Clique em "Emitir Certificado"

### Validação de Certificados

1. Acesse o menu "Certificados" e selecione "Validar Certificado"
2. Insira o número de série do certificado
3. Clique em "Validar"

### Envios de E-mail

Administradores podem acessar "E-mails" no painel para enviar uma mensagem para todos os usuários ativos ou apenas usuários específicos.

O sistema também envia notificações automáticas quando:

- um usuário solicita um certificado
- uma solicitação é aprovada
- uma solicitação é rejeitada
- um usuário faz login

O envio pode usar SMTP ou Resend. Configure `EMAIL_PROVIDER=smtp` com `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` e `SMTP_PASSWORD`, ou `EMAIL_PROVIDER=resend` com `RESEND_API_KEY`. Se `EMAIL_PROVIDER` ficar vazio e `RESEND_API_KEY` existir, o sistema usa Resend automaticamente; caso contrário, usa SMTP.

As notificações automáticas não bloqueiam o fluxo do usuário se o provedor de e-mail estiver indisponível ou incompleto. Já o envio manual pelo painel exige configuração de e-mail válida.

## Segurança

**IMPORTANTE**: Este sistema é destinado APENAS para fins de teste e desenvolvimento. Os certificados emitidos NÃO são reconhecidos oficialmente e NÃO devem ser utilizados em ambientes de produção.

## Tecnologias Utilizadas

- **Backend**: Node.js, Express
- **Frontend**: Bootstrap, Pug
- **Banco de Dados**: PostgreSQL, SQLite legado para migração
- **Criptografia**: node-forge, OpenSSL
- **Ambiente**: dotenv para configuração de variáveis de ambiente

## Solução de Problemas

### Erro no CPF do Responsável (e-CNPJ)

Se você encontrar o erro `TypeError: Cannot read properties of undefined (reading 'padStart')` ao emitir um certificado e-CNPJ, verifique se o campo "CPF" do responsável legal está preenchido corretamente. Este erro geralmente ocorre devido a uma incompatibilidade entre o nome do campo no formulário (`responsibleCpf`) e o nome esperado pelo backend (`responsibleCPF`).

### Problemas com Certificados SSL

Se encontrar problemas com os certificados SSL:

1. Verifique se o OpenSSL está instalado e acessível no seu sistema
2. Certifique-se de que a pasta `src/ssl` existe e tem permissões de escrita
3. Verifique as configurações no arquivo `.env`
4. Se os certificados não estiverem sendo gerados, verifique os logs do servidor para identificar possíveis erros
5. Certifique-se de que as portas especificadas para HTTP e HTTPS não estão sendo utilizadas por outros serviços

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para detalhes.

## Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests.

## Contato

Para dúvidas ou sugestões, entre em contato através de [contato@zerocert.com.br].
