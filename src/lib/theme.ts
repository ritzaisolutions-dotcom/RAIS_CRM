export const THEME_STORAGE_KEY = "rais-theme";

/**
 * Läuft vor dem ersten Paint (im <head>), damit es beim Laden nicht hell
 * aufblitzt. Ohne gespeicherte Wahl gilt die Systemeinstellung.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})();`;
