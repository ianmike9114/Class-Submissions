// Light/dark toggle for the shadcn theme (css/style.css, `.dark` on <html>).
// The first paint is handled by the inline script in each page's <head>
// (reads localStorage "theme", else the device setting); this file only wires
// every [data-theme-toggle] button and keeps aria-pressed in sync.
(function () {
  var root = document.documentElement;
  function sync() {
    var dark = root.classList.contains("dark");
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-pressed", dark ? "true" : "false");
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!b) return;
    var on = root.classList.toggle("dark");
    try { localStorage.setItem("theme", on ? "dark" : "light"); } catch (err) {}
    sync();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
