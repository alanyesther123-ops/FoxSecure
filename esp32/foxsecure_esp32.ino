/*
  FOXSECURE - MODELO DE INTEGRACAO ESP32
  Requer a biblioteca "ESP32Servo" instalada na Arduino IDE.
  Ajuste pino, posicoes e rede conforme o prototipo real.
  O token abaixo deve ser IGUAL a DEVICE_TOKEN do arquivo .env do servidor.
*/
#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>

const char* WIFI_SSID = "NOME_DA_REDE";
const char* WIFI_PASSWORD = "SENHA_DA_REDE";
const char* DEVICE_TOKEN = "COLOQUE_O_MESMO_TOKEN_DO_ENV";

const int SERVO_PIN = 18;
const int SERVO_FECHADO = 10; // Ajustar ao mecanismo real.
const int SERVO_ABERTO = 90;  // Ajustar ao mecanismo real.

WebServer server(80);
Servo trava;
String charadasAtuais = "[]";

bool autorizado() {
  return server.header("X-Device-Token") == DEVICE_TOKEN;
}
void responderNaoAutorizado() {
  server.send(401, "application/json", "{\"ok\":false,\"error\":\"unauthorized\"}");
}
void handleConfigure() {
  if (!autorizado()) return responderNaoAutorizado();
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"missing body\"}");
    return;
  }
  // O ESP32 recebe a configuração para manter a versão atual das charadas.
  // A validação do código e das tentativas continua no servidor Node.js.
  charadasAtuais = server.arg("plain");
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"configurado\"}");
}
void handleUnlock() {
  if (!autorizado()) return responderNaoAutorizado();
  trava.write(SERVO_ABERTO);
  delay(1500); // Tempo demonstrativo; ajuste mecanicamente com orientação do professor.
  trava.write(SERVO_FECHADO);
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"comando executado\"}");
}
void setup() {
  Serial.begin(115200);
  trava.setPeriodHertz(50);
  trava.attach(SERVO_PIN, 500, 2400);
  trava.write(SERVO_FECHADO);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando ao Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println();
  Serial.print("IP do ESP32: ");
  Serial.println(WiFi.localIP());

  const char* headers[] = {"X-Device-Token"};
  server.collectHeaders(headers, 1);
  server.on("/api/configure", HTTP_POST, handleConfigure);
  server.on("/api/unlock", HTTP_POST, handleUnlock);
  server.begin();
}
void loop() { server.handleClient(); }
