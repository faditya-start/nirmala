/* Applies the saved theme before first paint so a dark-theme user never sees a light flash.
   External file on purpose: the CSP (script-src 'self') forbids inline scripts.
   Key and values must match src/lib/theme.ts. */
(function () {
  try {
    var theme = window.localStorage.getItem("nirmala.theme");
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
  } catch (error) {
    /* storage blocked: tokens.css falls back to prefers-color-scheme */
  }
})();
