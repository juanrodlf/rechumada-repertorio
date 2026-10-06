// Estado global de la aplicación
const AppState = {
  songs: [],
  setlist: [],
  ghConfig: {
    owner: localStorage.getItem('rechumada_gh_owner') || '',
    repo: localStorage.getItem('rechumada_gh_repo') || '',
    token: localStorage.getItem('rechumada_gh_token') || ''
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  loadLibrary();
});

// Inicialización de escuchadores de eventos
function initUI() {
  document.getElementById('search-input').addEventListener('input', renderLibrary);
  document.getElementById('filter-tag').addEventListener('change', renderLibrary);
  document.getElementById('filter-capo').addEventListener('change', renderLibrary);

  // Modales
  document.getElementById('btn-config').addEventListener('click', openConfigModal);
  document.getElementById('btn-close-config').addEventListener('click', () => toggleModal('modal-config', false));
  document.getElementById('btn-save-config').addEventListener('click', saveGitHubConfig);

  document.getElementById('btn-nueva-cancion').addEventListener('click', openNewSongModal);
  document.getElementById('btn-close-song').addEventListener('click', () => toggleModal('modal-song', false));
  document.getElementById('btn-submit-song').addEventListener('click', saveSongToGitHub);

  document.getElementById('btn-add-page-break').addEventListener('click', () => {
    const txtArea = document.getElementById('song-content');
    const cursorPos = txtArea.selectionStart;
    const textBefore = txtArea.value.substring(0, cursorPos);
    const textAfter = txtArea.value.substring(cursorPos);
    txtArea.value = textBefore + '\n--- SALTO DE PÁGINA ---\n' + textAfter;
    txtArea.focus();
  });

  document.getElementById('btn-clear-setlist').addEventListener('click', () => {
    if (confirm('¿Vaciar el setlist actual?')) {
      AppState.setlist = [];
      renderSetlist();
    }
  });

  document.getElementById('btn-generate-pdf').addEventListener('click', generatePDF);
}

function toggleModal(id, show) {
  const modal = document.getElementById(id);
  if (show) modal.classList.add('active');
  else modal.classList.remove('active');
}

// Carga del catálogo desde el repositorio público de GitHub
async function loadLibrary() {
  const libraryContainer = document.getElementById('songs-list');
  libraryContainer.innerHTML = '<div class="empty-state">Cargando canciones...</div>';

  const owner = AppState.ghConfig.owner;
  const repo = AppState.ghConfig.repo;

  if (owner && repo) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/canciones`);
      if (!res.ok) throw new Error('No se pudo acceder a la carpeta /canciones en GitHub');
      const files = await res.json();

      const jsonFiles = files.filter(f => f.name.endsWith('.json'));
      const songPromises = jsonFiles.map(async file => {
        const songRes = await fetch(file.download_url);
        return await songRes.json();
      });

      AppState.songs = await Promise.all(songPromises);
      AppState.songs.sort((a, b) => a.title.localeCompare(b.title));
      renderLibrary();
      return;
    } catch (err) {
      console.warn('Fallo al leer de GitHub, cargando canciones de respaldo:', err);
    }
  }

  // Si no hay configuración o falla la llamada, se cargan temas de muestra
  AppState.songs = getFallbackSongs();
  renderLibrary();
}

function renderLibrary() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const filterTag = document.getElementById('filter-tag').value;
  const filterCapo = document.getElementById('filter-capo').value;

  const filtered = AppState.songs.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query);
    const matchesTag = !filterTag || (s.tags && s.tags.includes(filterTag));
    const matchesCapo = filterCapo === '' || s.capo.toString() === filterCapo;
    return matchesSearch && matchesTag && matchesCapo;
  });

  document.getElementById('library-count').textContent = `${filtered.length} temas`;
  const container = document.getElementById('songs-list');
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No se encontraron temas con esos filtros.</div>';
    return;
  }

  filtered.forEach(song => {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `
      <div class="song-info">
        <h4>${song.title}</h4>
        <div class="song-meta">
          <span>${song.artist}</span>
          ${song.capo > 0 ? `<span class="capo-tag">Capo ${song.capo}</span>` : ''}
          ${song.notes ? `<span>• <em>${song.notes}</em></span>` : ''}
        </div>
      </div>
      <button class="btn btn-secondary btn-small" onclick="addToSetlist('${song.id}')">+</button>
    `;
    container.appendChild(card);
  });
}

// Lógica de Setlist
window.addToSetlist = function(songId) {
  const song = AppState.songs.find(s => s.id === songId);
  if (!song) return;
  AppState.setlist.push({ ...song });
  renderSetlist();
};

window.removeFromSetlist = function(index) {
  AppState.setlist.splice(index, 1);
  renderSetlist();
};

window.moveSetlist = function(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= AppState.setlist.length) return;
  const temp = AppState.setlist[index];
  AppState.setlist[index] = AppState.setlist[target];
  AppState.setlist[target] = temp;
  renderSetlist();
};

function renderSetlist() {
  const container = document.getElementById('setlist-items');
  container.innerHTML = '';

  let totalMin = 0;
  let totalPages = 0;

  if (AppState.setlist.length === 0) {
    container.innerHTML = `<div class="empty-state">El repertorio está vacío. Añade canciones de la biblioteca.</div>`;
  } else {
    AppState.setlist.forEach((song, idx) => {
      totalMin += song.duration_min || 3.5;
      const songPages = (song.pages && song.pages.length) ? song.pages.length : 1;
      totalPages += songPages;

      const prevCapo = idx > 0 ? AppState.setlist[idx - 1].capo : null;
      const capoChanged = idx > 0 && song.capo !== prevCapo;

      const row = document.createElement('div');
      row.className = 'setlist-row';
      row.innerHTML = `
        <span class="setlist-order">${idx + 1}</span>
        <div class="setlist-row-info">
          <h4>${song.title} ${capoChanged ? `<span class="capo-alert">⚡ Capo ${song.capo}</span>` : ''}</h4>
          <div class="song-meta">
            <span>${song.artist}</span>
            ${song.capo > 0 ? `<span class="capo-tag">Capo ${song.capo}</span>` : '<span>Sin Capo</span>'}
            <span>• ${songPages} pág.</span>
          </div>
        </div>
        <div class="setlist-row-actions">
          <button class="btn-icon" onclick="moveSetlist(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn-icon" onclick="moveSetlist(${idx}, 1)" ${idx === AppState.setlist.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="btn-icon" onclick="removeFromSetlist(${idx})">✕</button>
        </div>
      `;
      container.appendChild(row);
    });
  }

  document.getElementById('stat-songs').textContent = `${AppState.setlist.length} temas`;
  document.getElementById('stat-duration').textContent = `~${Math.round(totalMin)} min`;
  document.getElementById('stat-pages').textContent = `${totalPages + (totalPages > 0 ? 1 : 0)} págs. PDF`;
}

// Configuración de GitHub
function openConfigModal() {
  document.getElementById('gh-owner').value = AppState.ghConfig.owner;
  document.getElementById('gh-repo').value = AppState.ghConfig.repo;
  document.getElementById('gh-token').value = AppState.ghConfig.token;
  toggleModal('modal-config', true);
}

function saveGitHubConfig() {
  const owner = document.getElementById('gh-owner').value.trim();
  const repo = document.getElementById('gh-repo').value.trim();
  const token = document.getElementById('gh-token').value.trim();

  AppState.ghConfig = { owner, repo, token };
  localStorage.setItem('rechumada_gh_owner', owner);
  localStorage.setItem('rechumada_gh_repo', repo);
  localStorage.setItem('rechumada_gh_token', token);

  toggleModal('modal-config', false);
  alert('Ajustes guardados correctamente.');
  loadLibrary();
}

// Formulario y subida de canciones a GitHub
function openNewSongModal() {
  document.getElementById('song-title').value = '';
  document.getElementById('song-artist').value = '';
  document.getElementById('song-capo').value = '0';
  document.getElementById('song-tag').value = '';
  document.getElementById('song-notes').value = '';
  document.getElementById('song-content').value = '';
  toggleModal('modal-song', true);
}

async function saveSongToGitHub() {
  const title = document.getElementById('song-title').value.trim();
  const artist = document.getElementById('song-artist').value.trim();
  const capo = parseInt(document.getElementById('song-capo').value, 10);
  const tag = document.getElementById('song-tag').value.trim();
  const notes = document.getElementById('song-notes').value.trim();
  const content = document.getElementById('song-content').value;

  if (!title || !artist || !content) {
    alert('Por favor, completa al menos el título, artista y la letra con acordes.');
    return;
  }

  if (!AppState.ghConfig.token || !AppState.ghConfig.owner || !AppState.ghConfig.repo) {
    alert('Debes configurar primero tu Token y Repositorio en "Ajustes GitHub".');
    openConfigModal();
    return;
  }

  const rawPages = content.split(/---(?:SALTO DE PÁGINA)?---/i);
  const pages = rawPages.map((pg, i) => ({
    page_num: i + 1,
    content: pg.trim()
  })).filter(pg => pg.content.length > 0);

  const songId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const songData = {
    id: songId,
    title: title.toUpperCase(),
    artist: artist.toUpperCase(),
    capo: capo,
    notes: notes,
    duration_min: 3.5,
    tags: tag ? [tag] : ['Acústico'],
    pages: pages
  };

  const btnSubmit = document.getElementById('btn-submit-song');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Guardando en GitHub...';

  try {
    const path = `canciones/${songId}.json`;
    const jsonString = JSON.stringify(songData, null, 2);
    const contentEncoded = btoa(unescape(encodeURIComponent(jsonString)));

    const url = `https://api.github.com/repos/${AppState.ghConfig.owner}/${AppState.ghConfig.repo}/contents/${path}`;
    
    let sha = null;
    const checkRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AppState.ghConfig.token}` }
    });
    if (checkRes.ok) {
      const fileData = await checkRes.json();
      sha = fileData.sha;
    }

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${AppState.ghConfig.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Añadir canción: ${songData.title}`,
        content: contentEncoded,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(err.message || 'Error al guardar');
    }

    alert('¡Canción guardada con éxito en GitHub!');
    toggleModal('modal-song', false);
    loadLibrary();
  } catch (err) {
    alert('Error al comunicarse con GitHub: ' + err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = '💾 Guardar Canción en GitHub';
  }
}

// Mantiene tildes, eñes, diéresis y signos de apertura; reemplaza solo caracteres Unicode incompatibles
function cleanPdfText(str) {
  if (!str) return '';
  return str
    .replace(/[“”""]/g, '"')
    .replace(/[’']/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[•·]/g, '-')
    .replace(/[↑▲]/g, '^')
    .replace(/[↓▼]/g, 'v')
    .replace(/[←◄]/g, '<')
    .replace(/[→►]/g, '>')
    // Conserva caracteres estándar imprimibles ASCII y Latin-1 (tildes, eñes, diéresis, ¿, ¡)
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
}

// Motor de generación de PDF con enlaces clicables
async function generatePDF() {
  const btn = document.getElementById('btn-generate-pdf');

  if (!AppState.setlist || AppState.setlist.length === 0) {
    alert('Añade al menos una canción al repertorio antes de generar el PDF.');
    return;
  }

  if (typeof PDFLib === 'undefined') {
    alert('Error: La librería pdf-lib no se ha cargado. Revisa tu conexión a internet o el script en index.html.');
    return;
  }

  try {
    btn.disabled = true;
    btn
