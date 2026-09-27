/* Modo oscuro del panel y el admin: se pinta antes de que arranque Angular para que no parpadee en claro.
   Va en un archivo aparte (no en línea) para que la política de seguridad de contenido pueda prohibir scripts en línea. */
try {
  if (localStorage.getItem('partly.theme') === 'dark' && /^\/(panel|admin(?!\/login)|partly-ops-b70ae4(?!\/login))(\/|$)/.test(location.pathname)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
