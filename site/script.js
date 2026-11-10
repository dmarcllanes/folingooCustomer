const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#primary-nav");

menuButton.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menuButton.querySelector(".sr-only").textContent = isOpen ? "Open navigation" : "Close navigation";
  navigation.classList.toggle("is-open", !isOpen);
});

navigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.querySelector(".sr-only").textContent = "Open navigation";
    navigation.classList.remove("is-open");
  }
});

const feedbackButton = document.querySelector("#feedback-toggle");
const sampleFeedback = document.querySelector("#sample-feedback");

feedbackButton.addEventListener("click", () => {
  const isExpanded = feedbackButton.getAttribute("aria-expanded") === "true";
  feedbackButton.setAttribute("aria-expanded", String(!isExpanded));
  sampleFeedback.hidden = isExpanded;
  feedbackButton.innerHTML = isExpanded
    ? 'See sample feedback <span aria-hidden="true">↓</span>'
    : 'Hide sample feedback <span aria-hidden="true">↑</span>';
});

const signupForm = document.querySelector("#beta-signup");
const signupStatus = document.querySelector("#signup-status");
const signupSubmit = signupForm.querySelector('button[type="submit"]');

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  signupSubmit.disabled = true;
  signupStatus.textContent = "Sending your request…";

  try {
    const formData = new FormData(signupForm);
    const response = await fetch(signupForm.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    const result = await response.json();

    if (!response.ok) {
      signupStatus.textContent = result.message || "We couldn’t submit your request. Please try again.";
      return;
    }

    signupStatus.textContent = "Thanks! Your request is on the list. We’ll email your beta access instructions.";
    signupForm.reset();
  } catch {
    signupStatus.textContent = "We couldn’t submit your request. Please check your connection and try again.";
  } finally {
    signupSubmit.disabled = false;
  }
});
