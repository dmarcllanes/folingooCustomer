const loginForm = document.querySelector("#admin-login");
const usernameInput = document.querySelector("#admin-username");
const passwordInput = document.querySelector("#admin-password");
const statusMessage = document.querySelector("#admin-status");
const testerList = document.querySelector("#admin-list");
const signupRows = document.querySelector("#admin-signups");
const signupCount = document.querySelector("#admin-count");
const pageMessage = document.querySelector("#admin-page");
const previousButton = document.querySelector("#admin-previous");
const nextButton = document.querySelector("#admin-next");
const logoutButton = document.querySelector("#admin-logout");
let currentPage = 1;
let totalPages = 1;

function showSignedOut(message = "") {
  loginForm.hidden = false;
  testerList.hidden = true;
  logoutButton.hidden = true;
  statusMessage.textContent = message;
}

function formatSignupDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function loadSignups(page = 1) {
  statusMessage.textContent = "Loading beta testers…";

  try {
    const response = await fetch(`/api/admin/signups?page=${page}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const result = await response.json();

    if (response.status === 401) {
      showSignedOut();
      return;
    }

    if (!response.ok) {
      statusMessage.textContent = result.message || "The tester list could not be loaded.";
      return;
    }

    currentPage = result.page;
    totalPages = result.totalPages;
    signupRows.replaceChildren();

    for (const signup of result.signups) {
      const row = document.createElement("tr");
      for (const value of [
        signup.email,
        signup.device === "ios" ? "iOS" : "Android",
        formatSignupDate(signup.createdAt),
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      signupRows.append(row);
    }

    signupCount.textContent = `${result.total} ${result.total === 1 ? "tester" : "testers"} registered`;
    pageMessage.textContent = `Page ${currentPage} of ${totalPages}`;
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    loginForm.hidden = true;
    testerList.hidden = false;
    logoutButton.hidden = false;
    statusMessage.textContent = "";
  } catch {
    statusMessage.textContent = "The tester list could not be loaded. Check your connection and try again.";
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  statusMessage.textContent = "Signing in…";

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      statusMessage.textContent = result.message || "Sign-in failed.";
      return;
    }

    usernameInput.value = "";
    passwordInput.value = "";
    await loadSignups();
  } catch {
    statusMessage.textContent = "Sign-in failed. Check your connection and try again.";
  } finally {
    submitButton.disabled = false;
  }
});

previousButton.addEventListener("click", () => loadSignups(currentPage - 1));
nextButton.addEventListener("click", () => loadSignups(currentPage + 1));

logoutButton.addEventListener("click", async () => {
  try {
    const response = await fetch("/api/admin/logout", { method: "POST" });
    if (!response.ok) {
      statusMessage.textContent = "Sign-out failed. Please try again.";
      return;
    }
    showSignedOut("You have signed out.");
  } catch {
    statusMessage.textContent = "Sign-out failed. Check your connection and try again.";
  }
});

loadSignups();
