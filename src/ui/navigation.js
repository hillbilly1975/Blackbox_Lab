// ======================================================
// BLACKBOX LAB — NAVIGATION
// ======================================================
//
// Turns the sidebar into a real screen switcher. Every
// <section data-screen="name"> in the workspace is one
// screen; every sidebar button with data-target="name"
// shows exactly that screen.
//
// ======================================================

export function initNavigation({ onScreenChange } = {}) {
  const buttons = document.querySelectorAll(".nav-button[data-target]");
  const screens = document.querySelectorAll("[data-screen]");

  function showScreen(name) {
    for (const screen of screens) {
      screen.classList.toggle(
        "screen-active",
        screen.dataset.screen === name
      );
    }

    for (const button of buttons) {
      button.classList.toggle(
        "active",
        button.dataset.target === name
      );
    }

    if (typeof onScreenChange === "function") {
      onScreenChange(name);
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      showScreen(button.dataset.target);
    });
  }

  showScreen("home");

  return { showScreen };
}
