/*
 * CASTA XBOX VAULT
 * IMPORTANTE: configura RAWG_API_KEY antes de usar la API.
 * Una clave usada en el navegador puede ser vista por cualquier visitante.
 * Para una publicación real, usa un backend/proxy con la clave en el servidor.
 */
const RAWG_API_KEY = "c74d22bb352c4ce9b84b79d75dd6452a";
const RAWG_BASE = "https://api.rawg.io/api";
const XBOX_360_PLATFORM_ID = 14; // RAWG: Xbox 360. Se puede confirmar en /platforms.
const PAGE_SIZE = 20;

const $ = (selector) => document.querySelector(selector);
const grid = $("#gamesGrid");
const statusBox = $("#status");
const countLabel = $("#resultCount");
const dialog = $("#gameDialog");
const dialogContent = $("#dialogContent");

let games = [];
let page = 1;
let isLoading = false;
let showFavoritesOnly = false;
let deferredInstallPrompt = null;
let genres = [];

const getFavorites = () => {
  try { return JSON.parse(localStorage.getItem("cxv_favorites") || "[]"); }
  catch { return []; }
};
const saveFavorites = (items) => localStorage.setItem("cxv_favorites", JSON.stringify(items));
const isFavorite = (id) => getFavorites().some((game) => game.id === id);

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`.trim();
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}
function formatDate(value) {
  if (!value) return "Fecha desconocida";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-MX", {year:"numeric", month:"short", day:"numeric"});
}
function getGenres(game) {
  return (game.genres || []).map((genre) => genre.name).filter(Boolean);
}
function uniqueGenres(items) {
  const all = [...new Set(items.flatMap(getGenres))].sort((a,b) => a.localeCompare(b, "es"));
  const select = $("#genreFilter");
  const current = select.value;
  select.innerHTML = '<option value="">Todos los géneros</option>' +
    all.map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`).join("");
  if (all.includes(current)) select.value = current;
  genres = all;
}
function cacheKey() { return "cxv_cached_games_v1"; }
function saveCachedGames() {
  try {
    const all = new Map();
    const previous = JSON.parse(localStorage.getItem(cacheKey()) || "[]");
    [...previous, ...games].forEach((game) => all.set(game.id, game));
    localStorage.setItem(cacheKey(), JSON.stringify([...all.values()].slice(-150)));
    localStorage.setItem("cxv_cache_timestamp", String(Date.now()));
  } catch (error) {
    console.warn("No se pudo guardar el catálogo localmente.", error);
  }
}
function loadCachedGames() {
  try { return JSON.parse(localStorage.getItem(cacheKey()) || "[]"); }
  catch { return []; }
}
function renderGames() {
  const query = $("#searchInput").value.trim().toLocaleLowerCase("es");
  const genre = $("#genreFilter").value;
  const sort = $("#sortFilter").value;
  let visible = games.filter((game) => {
    const matchesName = (game.name || "").toLocaleLowerCase("es").includes(query);
    const matchesGenre = !genre || getGenres(game).includes(genre);
    const matchesFavorite = !showFavoritesOnly || isFavorite(game.id);
    return matchesName && matchesGenre && matchesFavorite;
  });
  if (sort === "rating") visible.sort((a,b) => (b.rating || 0) - (a.rating || 0));
  if (sort === "name") visible.sort((a,b) => (a.name || "").localeCompare(b.name || "", "es"));
  if (sort === "released") visible.sort((a,b) => (b.released || "").localeCompare(a.released || ""));
  if (!visible.length) {
    grid.innerHTML = `<div class="empty">${showFavoritesOnly ? "Todavía no tienes favoritos guardados." : "No encontramos juegos con esos filtros. Prueba otra búsqueda."}</div>`;
  } else {
    grid.innerHTML = visible.map((game) => {
      const image = game.background_image;
      const favorite = isFavorite(game.id);
      const genresText = getGenres(game).slice(0,2).join(" · ") || "Videojuego";
      return `<article class="game">
        <div class="cover">
          ${image ? `<img loading="lazy" src="${escapeHtml(image)}" alt="Portada de ${escapeHtml(game.name)}" onerror="this.style.display='none'">` : `<div class="placeholder">🎮</div>`}
          <button class="fav ${favorite ? "active" : ""}" data-favorite="${game.id}" aria-label="${favorite ? "Quitar de favoritos" : "Añadir a favoritos"}">${favorite ? "♥" : "♡"}</button>
        </div>
        <div class="game-info">
          <h4>${escapeHtml(game.name)}</h4>
          <div class="meta"><span class="pill">★ ${game.rating ? Number(game.rating).toFixed(1) : "N/D"}</span><span>${escapeHtml(formatDate(game.released))}</span></div>
          <div class="meta" style="margin-top:8px">${escapeHtml(genresText)}</div>
          <button class="details" data-details="${game.id}">Ver detalles</button>
        </div>
      </article>`;
    }).join("");
  }
  countLabel.textContent = `${visible.length} ${visible.length === 1 ? "juego" : "juegos"} mostrados`;
  $("#catalogTitle").textContent = showFavoritesOnly ? "Tus favoritos" : "Juegos de Xbox 360";
  $("#favoritesToggle").setAttribute("aria-pressed", String(showFavoritesOnly));
  $("#favoritesToggle").classList.toggle("primary", showFavoritesOnly);
  $("#loadMoreButton").hidden = showFavoritesOnly || !navigator.onLine;
}
function saveFavorite(game) {
  const favorites = getFavorites();
  const index = favorites.findIndex((item) => item.id === game.id);
  if (index >= 0) favorites.splice(index, 1);
  else favorites.push({
    id: game.id, name: game.name, background_image: game.background_image,
    rating: game.rating, released: game.released, genres: game.genres || [],
    description_raw: game.description_raw || ""
  });
  saveFavorites(favorites);
  renderGames();
}
async function fetchGames(reset = false) {
  if (isLoading || (!navigator.onLine)) {
    if (!navigator.onLine) setStatus("Estás sin conexión. Mostramos los juegos guardados anteriormente.");
    return;
  }
  if (RAWG_API_KEY === "PEGA_AQUI_TU_CLAVE_DE_RAWG" || !RAWG_API_KEY.trim()) {
    const cached = loadCachedGames();
    if (cached.length) {
      games = cached;
      uniqueGenres(games);
      renderGames();
    }
    setStatus("Falta configurar tu clave de RAWG en app.js. Abre el archivo y reemplaza PEGA_AQUI_TU_CLAVE_DE_RAWG.", "error");
    return;
  }
  isLoading = true;
  if (reset) { page = 1; games = []; grid.innerHTML = ""; }
  $("#loadMoreButton").disabled = true;
  setStatus("Conectando con RAWG y cargando videojuegos de Xbox 360…");
  try {
    const url = new URL(`${RAWG_BASE}/games`);
    url.searchParams.set("key", RAWG_API_KEY);
    url.searchParams.set("platforms", String(XBOX_360_PLATFORM_ID));
    url.searchParams.set("page_size", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("ordering", "-added");
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("RAWG rechazó la clave API. Revisa que sea correcta y que tu cuota esté disponible.");
      if (response.status === 429) throw new Error("RAWG limitó temporalmente las solicitudes. Espera un poco y vuelve a intentar.");
      throw new Error(`RAWG respondió con error HTTP ${response.status}.`);
    }
    const data = await response.json();
    const incoming = Array.isArray(data.results) ? data.results : [];
    if (reset) games = incoming;
    else {
      const ids = new Set(games.map((game) => game.id));
      games = [...games, ...incoming.filter((game) => !ids.has(game.id))];
    }
    saveCachedGames();
    uniqueGenres(games);
    renderGames();
    const cachedAt = new Date().toLocaleTimeString("es-MX", {hour:"2-digit", minute:"2-digit"});
    setStatus(`Catálogo actualizado desde RAWG. Última consulta: ${cachedAt}.`);
    $("#loadMoreButton").hidden = !data.next;
    $("#loadMoreButton").dataset.hasNext = data.next ? "true" : "false";
    if (data.next) page += 1;
  } catch (error) {
    console.error(error);
    const cached = loadCachedGames();
    if (!games.length && cached.length) games = cached;
    uniqueGenres(games);
    renderGames();
    setStatus(`${error.message || "No se pudo conectar con RAWG."} ${games.length ? "Mostramos los datos guardados disponibles." : "Comprueba tu conexión e inténtalo de nuevo."}`, "error");
  } finally {
    isLoading = false;
    $("#loadMoreButton").disabled = false;
  }
}
function openDetails(id) {
  const game = games.find((item) => item.id === Number(id)) || getFavorites().find((item) => item.id === Number(id));
  if (!game) return;
  const description = game.description_raw || "RAWG no proporcionó una descripción en esta consulta. Conéctate a internet y vuelve a cargar el juego para consultar más información.";
  dialogContent.innerHTML = `
    <div class="modal-top"><span class="eyebrow">FICHA DEL JUEGO</span><button class="btn" id="closeDialog" aria-label="Cerrar">×</button></div>
    ${game.background_image ? `<img src="${escapeHtml(game.background_image)}" alt="Portada de ${escapeHtml(game.name)}">` : ""}
    <h2>${escapeHtml(game.name)}</h2>
    <div class="meta"><span class="pill">★ ${game.rating ? Number(game.rating).toFixed(1) : "Sin puntuación"}</span><span class="pill">${escapeHtml(formatDate(game.released))}</span></div>
    <p>${escapeHtml(description)}</p>
    <p><strong>Géneros:</strong> ${escapeHtml(getGenres(game).join(", ") || "No disponibles")}</p>
    <p><strong>Plataforma:</strong> Xbox 360 (filtro de catálogo)</p>
    <div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn primary" id="modalFavorite" data-favorite="${game.id}">${isFavorite(game.id) ? "♥ Quitar favorito" : "♡ Añadir a favoritos"}</button><a class="btn" href="https://rawg.io/games/${encodeURIComponent(game.slug || "")}" target="_blank" rel="noreferrer">Ver en RAWG ↗</a></div>`;
  dialog.showModal();
  $("#closeDialog").addEventListener("click", () => dialog.close());
  $("#modalFavorite").addEventListener("click", () => {
    saveFavorite(game);
    $("#modalFavorite").textContent = isFavorite(game.id) ? "♥ Quitar favorito" : "♡ Añadir a favoritos";
  });
}
grid.addEventListener("click", (event) => {
  const favoriteButton = event.target.closest("[data-favorite]");
  const detailsButton = event.target.closest("[data-details]");
  if (favoriteButton) {
    const id = Number(favoriteButton.dataset.favorite);
    const game = games.find((item) => item.id === id) || getFavorites().find((item) => item.id === id);
    if (game) saveFavorite(game);
  } else if (detailsButton) openDetails(detailsButton.dataset.details);
});
$("#searchButton").addEventListener("click", () => {
  if (!games.length && navigator.onLine) fetchGames(true);
  else renderGames();
});
$("#searchInput").addEventListener("input", renderGames);
$("#genreFilter").addEventListener("change", renderGames);
$("#sortFilter").addEventListener("change", renderGames);
$("#favoritesToggle").addEventListener("click", () => { showFavoritesOnly = !showFavoritesOnly; renderGames(); });
$("#loadMoreButton").addEventListener("click", () => {
  if ($("#loadMoreButton").dataset.hasNext === "true") fetchGames(false);
});
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

window.addEventListener("online", () => {
  setStatus("Conexión recuperada. Puedes actualizar el catálogo.");
  if (!games.length) fetchGames(true);
});
window.addEventListener("offline", () => {
  setStatus("Sin conexión. La app shell y los juegos guardados pueden seguir disponibles.", "");
  if (!games.length) { games = loadCachedGames(); uniqueGenres(games); renderGames(); }
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#installButton").hidden = false;
});
$("#installButton").addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    setStatus("Si tu navegador ofrece instalar la app, usa el menú del navegador y elige “Instalar aplicación” o “Añadir a pantalla de inicio”.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#installButton").hidden = true;
});
window.addEventListener("appinstalled", () => {
  $("#installButton").hidden = true;
  setStatus("CASTA XBOX VAULT se instaló correctamente.");
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(() => console.info("Service worker registrado."))
      .catch((error) => console.warn("No se pudo registrar el service worker:", error));
  });
}

(function init() {
  const cached = loadCachedGames();
  const favorites = getFavorites();
  if (cached.length) {
    games = cached;
    uniqueGenres(games);
    renderGames();
    setStatus(`Mostrando ${games.length} juegos guardados. ${navigator.onLine ? "Intentando actualizar…" : "Estás sin conexión."}`);
  } else if (favorites.length) {
    games = favorites;
    uniqueGenres(games);
    renderGames();
  }
  if (navigator.onLine) fetchGames(!cached.length);
  else {
    if (!games.length) games = favorites;
    uniqueGenres(games);
    renderGames();
    setStatus("Sin conexión. Cuando visites el catálogo con internet, los juegos consultados podrán guardarse para próximas visitas.");
  }
})();
