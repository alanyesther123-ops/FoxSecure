const riddlesArea = document.querySelector("#riddles");
const challengeMessage = document.querySelector("#challengeMessage");
const attemptsLabel = document.querySelector("#attempts");
const userName = document.querySelector("#userName");
const codeForm = document.querySelector("#codeForm");
const digitInputs = [...document.querySelectorAll(".digit-inputs input")];

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ocorreu um erro.");
  return data;
}
function message(text, type = "") {
  challengeMessage.textContent = text;
  challengeMessage.className = "message " + type;
}
async function loadChallenge() {
  try {
    const me = await api("/api/me");
    userName.textContent = me.user.nome;
    const data = await api("/api/challenge");
    attemptsLabel.textContent = String(data.attemptsLeft).padStart(2, "0");
    riddlesArea.innerHTML = "";
    data.riddles.forEach((riddle, index) => {
      const card = document.createElement("article");
      card.className = "riddle-card";
      const number = document.createElement("span");
      number.textContent = `CHARADA 0${index + 1} • ${riddle.level}`;
      const question = document.createElement("h3");
      question.textContent = riddle.question;
      card.append(number, question);
      riddlesArea.append(card);
    });
    if (data.attemptsLeft === 0) {
      codeForm.querySelector("button").disabled = true;
      message("Sua conta está bloqueada. Procure o administrador.", "error");
    }
  } catch (error) {
    message(error.message, "error");
    if (error.message.includes("login")) window.location.href = "index.html";
  }
}
digitInputs.forEach((input, index) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 1);
    if (input.value && digitInputs[index + 1]) digitInputs[index + 1].focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !input.value && digitInputs[index - 1]) digitInputs[index - 1].focus();
  });
});
codeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = digitInputs.map(input => input.value).join("");
  if (!/^\d{4}$/.test(code)) return message("Preencha os quatro dígitos.", "error");
  try {
    const data = await api("/api/attempt", { method: "POST", body: JSON.stringify({ code }) });
    message(data.message, "success");
    codeForm.querySelector("button").disabled = true;
    digitInputs.forEach(input => input.disabled = true);
  } catch (error) {
    message(error.message, "error");
    try {
      const data = await api("/api/challenge");
      attemptsLabel.textContent = String(data.attemptsLeft).padStart(2, "0");
      if (data.attemptsLeft === 0) {
        codeForm.querySelector("button").disabled = true;
        digitInputs.forEach(input => input.disabled = true);
      } else {
        digitInputs.forEach(input => input.value = "");
        digitInputs[0].focus();
      }
    } catch (_) {
      codeForm.querySelector("button").disabled = true;
    }
  }
});
document.querySelector("#logout").addEventListener("click", async (event) => {
  event.preventDefault();
  await api("/api/logout", { method: "POST" }).catch(() => { });
  window.location.href = "index.html";
});
loadChallenge();
