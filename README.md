# FOXSECURE — Guia de instalação

Projeto acadêmico de cofre automatizado com caixa impressa em 3D, ESP32 e microservo.

## 1. Tecnologias

- HTML: estrutura das páginas.
- CSS: identidade visual responsiva.
- JavaScript no navegador: formulários, interação e desafios.
- Node.js + Express: servidor e API.
- SQLite: banco de dados local de usuários, tentativas e desafio ativo.
- ESP32: recebe comandos autenticados para configurar o desafio e acionar o microservo.

## 2. Requisitos

Instale:
1. Visual Studio Code.
2. Node.js LTS (inclui npm).
3. Uma extensão de terminal no VS Code não é necessária: o terminal já vem integrado.

Confira no terminal:
```bash
node -v
npm -v
```
Se os dois comandos mostrarem versões, a instalação está funcionando.

## 3. Abrir o projeto

1. Extraia o ZIP em uma pasta fácil de encontrar.
2. Abra o VS Code.
3. Clique em **Arquivo > Abrir Pasta** e selecione a pasta `FoxSecure`.
4. Abra **Terminal > Novo Terminal**.

## 4. Preparar o ambiente

No terminal, dentro da pasta FoxSecure, execute:
```bash
npm install
```
Depois crie o arquivo `.env`:
- No VS Code, clique com o botão direito na pasta principal.
- Escolha **Novo Arquivo**.
- Digite `.env` (incluindo o ponto).
- Copie o conteúdo de `.env.example` para ele.
- Troque `SESSION_SECRET`, `ADMIN_PASSWORD` e `DEVICE_TOKEN` por valores longos e privados.
- Para começar, mantenha `DEVICE_MODE=SIMULATOR`.

Não publique o `.env` no GitHub. Ele contém segredos.

## 5. Iniciar o site

No terminal:
```bash
npm start
```
Abra no navegador:
```text
http://localhost:3000
```
Para encerrar o servidor, volte ao terminal e pressione `Ctrl + C`.

## 6. Entrar como administrador

Os dados do administrador são os que você colocou em `.env`:
- Usuário: valor de `ADMIN_USERNAME`.
- Senha: valor de `ADMIN_PASSWORD`.

Faça login na página inicial. O sistema redireciona a conta administrativa para `admin.html`.
Não use uma senha fraca nem compartilhe as credenciais.

## 7. Como testar

1. Crie uma conta comum.
2. Resolva as quatro charadas e digite os quatro dígitos na ordem.
3. No modo SIMULATOR, o terminal registra que recebeu o comando, mas nenhum servo físico é acionado.
4. Faça três tentativas incorretas para verificar o bloqueio.
5. Entre como administrador e libere a conta na lista.
6. Use “Gerar novo desafio” para renovar as charadas.

O bloqueio é permanente até o administrador liberar a conta. Isso evita que um visitante continue tentando, mas permite recuperação em caso de erro.

## 8. Fotos do cofre

Coloque as imagens em `public/images`:
- `cofre-frente.jpg`
- `cofre-detalhe.jpg`

A página `sobre.html` já tem espaços reservados. Para exibir as fotos, substitua cada bloco `photo-placeholder` por:
```html
<div class="photo-placeholder">
  <img src="images/cofre-frente.jpg" alt="Vista frontal do cofre FoxSecure">
</div>
```
Repita com `cofre-detalhe.jpg` no segundo espaço. Para a imagem ficar bem dimensionada, acrescente ao final de `style.css`:
```css
.photo-placeholder img {
  width: 100%;
  max-height: 430px;
  object-fit: contain;
  border-radius: 8px;
}
```

## 9. Integrar o ESP32

O arquivo `esp32/foxsecure_esp32.ino` é um exemplo de firmware de integração:
1. Abra o Arduino IDE e instale a biblioteca `ESP32Servo`.
2. Selecione a placa ESP32 correta.
3. Informe nome e senha do Wi-Fi no sketch.
4. Coloque no sketch o mesmo token que está em `DEVICE_TOKEN` no `.env`.
5. Faça o upload e abra o Monitor Serial para ver o IP do ESP32.
6. No `.env`, troque `DEVICE_MODE=SIMULATOR` por `DEVICE_MODE=ESP32`.
7. Preencha `ESP32_BASE_URL` com o IP mostrado no Monitor Serial, por exemplo `http://192.168.0.120`.
8. Reinicie o servidor com `Ctrl + C` e `npm start`.

**Atenção:** o servidor e o ESP32 precisam estar na mesma rede e conseguir se comunicar. O exemplo usa HTTP local e token compartilhado; não exponha a porta do ESP32 à internet. Para uso real, prefira uma rede isolada, token forte, autenticação adicional e revisão do professor/orientador. Ajuste a posição do servo, alimentação e mecanismo com o protótipo desligado e supervisão. Não conecte o servo diretamente a uma saída de alimentação inadequada do ESP32; use alimentação dimensionada e GND comum conforme a documentação do componente.

### Contrato de comunicação esperado

O servidor envia:
- `POST /api/configure` com JSON contendo as charadas e o código gerado.
- `POST /api/unlock` quando o usuário acerta ou o administrador solicita abertura de emergência.

Ambos levam o cabeçalho `X-Device-Token`. O sketch de exemplo verifica esse token.

**Importante:** o firmware de exemplo é uma base de integração. Antes de ligar o servo ao cofre real, compare com o código que sua equipe já fez para a rede do ESP32 e ajuste os endpoints, pino, ângulos, alimentação e lógica mecânica. O vídeo/teste de rede que você mencionou ainda não foi incluído nesta versão.

## 10. Banco de dados

O SQLite cria automaticamente:
- `users`: contas, senha protegida por hash, perfil e tentativas.
- `challenges`: charadas ativas e hash do código.

O banco é criado na primeira inicialização em `database/foxsecure.sqlite`. Não edite esse arquivo manualmente. Faça cópia de segurança antes de apagar ou substituir.

## 11. Observações importantes

- Este projeto é um protótipo escolar e não deve guardar objetos de alto valor.
- O modo de demonstração não abre um cofre físico.
- O botão de emergência é exclusivo do administrador.
- A senha dos usuários é armazenada com hash bcrypt, não em texto puro.
- A sessão usa armazenamento SQLite; em produção, configure HTTPS e cookies seguros.
- A renovação do desafio altera as charadas e o código do desafio para todos os usuários.
- A conta bloqueada só pode ser liberada pelo administrador.
