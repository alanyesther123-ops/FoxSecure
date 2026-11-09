async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ocorreu um erro.");
  return data;
}
const adminMessage = document.querySelector("#adminMessage");
function show(text, type = "") { adminMessage.textContent = text; adminMessage.className = "message " + type; }
async function loadUsers() {
  const area = document.querySelector("#usersList");
  try {
    const data = await api("/api/admin/users");
    area.innerHTML = "";
    if (!data.users.length) { area.textContent = "Ainda não há contas cadastradas."; return; }
    data.users.forEach(user => {
      const row = document.createElement("div");
      row.className = "user-row";
      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = user.nome;
      const details = document.createElement("p");
      details.textContent = `${user.username} • ${user.email} • erros: ${user.failed_attempts}/3`;
      const status = document.createElement("span");
      status.className = user.locked ? "locked-label" : "ok-label";
      status.textContent = user.locked ? "BLOQUEADO" : "ATIVO";
      info.append(name, details, status);
      row.append(info);
      if (user.locked) {
        const button = document.createElement("button");
        button.className = "button button-primary";
        button.textContent = "Liberar conta";
        button.addEventListener("click", async () => {
          try { const result = await api(`/api/admin/users/${user.id}/unlock`, { method: "POST" }); show(result.message, "success"); loadUsers(); }
          catch (error) { show(error.message, "error"); }
        });
        row.append(button);
      }
      area.append(row);
    });
  } catch (error) {
    area.textContent = error.message;
    if (error.message.includes("restrita") || error.message.includes("login")) window.location.href = "index.html";
  }
}
document.querySelector("#newChallenge").addEventListener("click", async () => {
  if (!confirm("Gerar quatro novas charadas e atualizar o código do cofre?")) return;
  try { const data = await api("/api/admin/new-user", { method: "POST" }); show(data.message, "success"); }
  catch (error) { show(error.message, "error"); }
});
document.querySelector("#emergencyOpen").addEventListener("click", async () => {
  if (!confirm("Confirmar o comando de abertura de emergência?")) return;
  try { const data = await api("/api/admin/emergency-open", { method: "POST" }); show(data.message, "success"); }
  catch (error) { show(error.message, "error"); }
});
document.querySelector("#logout").addEventListener("click", async (event) => {
  event.preventDefault();
  await api("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "index.html";
});
loadUsers();
