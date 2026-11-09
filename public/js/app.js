const tabs = document.querySelectorAll(".tab");
const registerForm = document.querySelector("#registerForm");
const loginForm = document.querySelector("#loginForm");
const authMessage = document.querySelector("#authMessage");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    const registering = tab.dataset.tab === "register";
    registerForm.classList.toggle("hidden", !registering);
    loginForm.classList.toggle("hidden", registering);
    showMessage(authMessage, "");
  });
});

function showMessage(element, text, type = "") {
  element.textContent = text;
  element.className = "message " + type;
}

async function sendForm(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const text = await response.text();
  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      response.status === 429
        ? "Muitas tentativas. Aguarde um pouco e tente novamente."
        : "O servidor retornou uma resposta inesperada."
    );
  }

  if (!response.ok) {
    throw new Error(result.error || "Não foi possível concluir a solicitação.");
  }

  return result;
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(registerForm).entries());
  try {
    const result = await sendForm("/api/register", data);
    showMessage(authMessage, "Conta criada! Abrindo o desafio...", "success");
    window.location.href = result.user.role === "admin" ? "admin.html" : "desafio.html";
  } catch (error) {
    showMessage(authMessage, error.message, "error");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm).entries());
  try {
    const result = await sendForm("/api/login", data);
    showMessage(authMessage, "Login realizado. Redirecionando...", "success");
    window.location.href = result.user.role === "admin" ? "admin.html" : "desafio.html";
  } catch (error) {
    showMessage(authMessage, error.message, "error");
  }
});
