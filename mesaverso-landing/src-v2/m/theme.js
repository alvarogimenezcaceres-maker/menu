// Inner pages: follow the system theme (the home page has its own toggle in v2.js). Kept as a file because the CSP forbids inline scripts.
if (!document.getElementById("theme") && matchMedia("(prefers-color-scheme: light)").matches) document.documentElement.dataset.theme = "light";
