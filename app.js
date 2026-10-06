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

  // Botones de Setlist (Guardar / Cargar / Vaciar)
  document.getElementById('btn-save-setlist').addEventListener('click', saveCurrentSetlist);
  document.getElementById('btn-load-setlist').addEventListener('click', openLoadSetlistModal);
  document.getElementById('btn-close-load-setlist').addEventListener('click', () => toggleModal('modal-load-setlist', false));

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
  if (modal) {
    if (show) modal.classList.add('active');
    else modal.classList.remove('active');
  }
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

  if (AppState.setlist.length === 0) {
    container.innerHTML = `<div class="empty-state">El repertorio está vacío. Añade canciones de la biblioteca.</div>`;
  } else {
    AppState.setlist.forEach((song, idx) => {
      totalMin += song.duration_min || 3.5;

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
  document.getElementById('stat-pages').textContent = `PDF Dinámico`;
}

// -------------------------------------------------------------
// GESTIÓN DE GUARDAR Y CARGAR SETLISTS (GITHUB / LOCALSTORAGE)
// -------------------------------------------------------------
async function saveCurrentSetlist() {
  if (AppState.setlist.length === 0) {
    alert('No puedes guardar un setlist vacío.');
    return;
  }

  const rawTitle = document.getElementById('setlist-title').value.trim() || 'RECHUMADA';
  const rawSubtitle = document.getElementById('setlist-subtitle').value.trim() || '';

  const defaultName = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const setlistName = prompt('Nombre para guardar este repertorio/plantilla:', defaultName);
  if (!setlistName) return;

  const setlistData = {
    id: setlistName,
    title: rawTitle,
    subtitle: rawSubtitle,
    saved_at: new Date().toISOString(),
    song_ids: AppState.setlist.map(s => s.id)
  };

  // Guardar copia siempre en localStorage
  let localSets = JSON.parse(localStorage.getItem('rechumada_local_setlists') || '{}');
  localSets[setlistName] = setlistData;
  localStorage.setItem('rechumada_local_setlists', JSON.stringify(localSets));

  // Intentar guardar en GitHub si hay credenciales
  if (AppState.ghConfig.token && AppState.ghConfig.owner && AppState.ghConfig.repo) {
    try {
      const path = `setlists/${setlistName}.json`;
      const jsonStr = JSON.stringify(setlistData, null, 2);
      const contentEncoded = btoa(unescape(encodeURIComponent(jsonStr)));
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
          message: `Guardar setlist: ${setlistData.title}`,
          content: contentEncoded,
          ...(sha ? { sha } : {})
        })
      });

      if (!putRes.ok) throw new Error('Error al sincronizar con GitHub');
      alert(`¡Repertorio "${setlistData.title}" guardado en GitHub y en local!`);
      return;
    } catch (err) {
      console.warn('Error guardando en GitHub:', err);
      alert(`Guardado en este navegador (local), pero falló la sincronización con GitHub: ${err.message}`);
      return;
    }
  }

  alert(`¡Repertorio "${setlistData.title}" guardado en este navegador!`);
}

async function openLoadSetlistModal() {
  const container = document.getElementById('saved-setlists-list');
  container.innerHTML = '<div class="empty-state">Buscando repertorios guardados...</div>';
  toggleModal('modal-load-setlist', true);

  const availableSets = new Map();

  // 1. Cargar locales
  const localSets = JSON.parse(localStorage.getItem('rechumada_local_setlists') || '{}');
  for (const [id, data] of Object.entries(localSets)) {
    availableSets.set(id, { ...data, source: 'Local' });
  }

  // 2. Cargar remotos de GitHub si es posible
  if (AppState.ghConfig.owner && AppState.ghConfig.repo) {
    try {
      const res = await fetch(`https://api.github.com/repos/${AppState.ghConfig.owner}/${AppState.ghConfig.repo}/contents/setlists`);
      if (res.ok) {
        const files = await res.json();
        const jsonFiles = files.filter(f => f.name.endsWith('.json'));
        for (const file of jsonFiles) {
          const sRes = await fetch(file.download_url);
          if (sRes.ok) {
            const data = await sRes.json();
            availableSets.set(data.id || file.name.replace('.json', ''), { ...data, source: 'GitHub' });
          }
        }
      }
    } catch (err) {
      console.warn('No se pudieron obtener setlists de GitHub:', err);
    }
  }

  container.innerHTML = '';
  if (availableSets.size === 0) {
    container.innerHTML = '<div class="empty-state">No hay repertorios guardados todavía.</div>';
    return;
  }

  availableSets.forEach((item, id) => {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.style.marginBottom = '8px';
    card.innerHTML = `
      <div class="song-info">
        <h4>${item.title || id}</h4>
        <div class="song-meta">
          <span>${item.subtitle || ''}</span>
          <span>• ${item.song_ids ? item.song_ids.length : 0} temas</span>
          <span class="badge">${item.source}</span>
        </div>
      </div>
      <div style="display: flex; gap: 6px;">
        <button class="btn btn-primary btn-small" onclick="loadSetlistById('${id}')">Cargar</button>
        ${item.source === 'Local' ? `<button class="btn btn-danger btn-small" onclick="deleteLocalSetlist('${id}')">🗑️</button>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

window.loadSetlistById = function(id) {
  // Buscar en local primero
  const localSets = JSON.parse(localStorage.getItem('rechumada_local_setlists') || '{}');
  let selected = localSets[id];

  // Si no está en local, buscar en los ya listados
  if (!selected) {
    // Buscar en la lista activa de la ventana
    alert('Cargando datos del repertorio...');
  }

  if (selected) {
    applySetlistData(selected);
    toggleModal('modal-load-setlist', false);
  } else {
    // Carga directa desde GitHub
    fetch(`https://api.github.com/repos/${AppState.ghConfig.owner}/${AppState.ghConfig.repo}/contents/setlists/${id}.json`)
      .then(r => r.json())
      .then(f => fetch(f.download_url))
      .then(r => r.json())
      .then(data => {
        applySetlistData(data);
        toggleModal('modal-load-setlist', false);
      })
      .catch(err => alert('Error al cargar el setlist: ' + err.message));
  }
};

function applySetlistData(data) {
  document.getElementById('setlist-title').value = data.title || 'RECHUMADA';
  document.getElementById('setlist-subtitle').value = data.subtitle || '';

  AppState.setlist = [];
  if (data.song_ids && Array.isArray(data.song_ids)) {
    data.song_ids.forEach(sid => {
      const match = AppState.songs.find(s => s.id === sid);
      if (match) AppState.setlist.push({ ...match });
    });
  }

  renderSetlist();
  alert(`Repertorio "${data.title}" cargado con éxito.`);
}

window.deleteLocalSetlist = function(id) {
  if (confirm(`¿Eliminar el repertorio "${id}" guardado en local?`)) {
    let localSets = JSON.parse(localStorage.getItem('rechumada_local_setlists') || '{}');
    delete localSets[id];
    localStorage.setItem('rechumada_local_setlists', JSON.stringify(localSets));
    openLoadSetlistModal();
  }
};

// -------------------------------------------------------------
// CONFIGURACIÓN DE GITHUB
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// FORMULARIO Y SUBIDA DE CANCIONES A GITHUB
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// FILTRADO DE CARACTERES Y MAQUETACIÓN PDF
// -------------------------------------------------------------
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
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
}

function isChordLine(str) {
  if (!str) return false;
  const trimmed = cleanPdfText(str).trim();
  if (trimmed === '') return false;
  if (/^\[.*\]$/.test(trimmed)) return false;
  return /^[A-G][b#]?(?:m|maj|min|dim|aug|sus|[0-9])*(?:\s+[A-G][b#]?(?:m|maj|min|dim|aug|sus|[0-9])*)*\s*$/.test(trimmed);
}

function splitIntoStanzas(rawText) {
  const lines = rawText.split('\n');
  const stanzas = [];
  let currentStanza = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBlank = line.trim() === '';
    const isSectionHeader = /^\[.*\]$/.test(line.trim());

    if (isSectionHeader && currentStanza.length > 0) {
      stanzas.push(currentStanza);
      currentStanza = [line];
    } else if (isBlank) {
      if (currentStanza.length > 0) {
        stanzas.push(currentStanza);
        currentStanza = [];
      }
    } else {
      currentStanza.push(line);
    }
  }

  if (currentStanza.length > 0) {
    stanzas.push(currentStanza);
  }

  return stanzas;
}

// Motor de generación de PDF con enlaces clicables y salto por estrofas
async function generatePDF() {
  const btn = document.getElementById('btn-generate-pdf');

  if (!AppState.setlist || AppState.setlist.length === 0) {
    alert('Añade al menos una canción al repertorio antes de generar el PDF.');
    return;
  }

  if (typeof PDFLib === 'undefined') {
    alert('Error: La librería pdf-lib no se ha cargado.');
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = '⏳ Paginando estrofas y generando PDF...';

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
    const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN_BOTTOM = 48;
    const LINE_HEIGHT = 13.5;
    const FONT_SIZE = 9.5;

    // 1. Página inicial de Índice (Pág. 1)
    const indexPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const indexPageRef = indexPage.ref;

    const rawTitle = document.getElementById('setlist-title').value || 'RECHUMADA';
    const rawSubtitle = document.getElementById('setlist-subtitle').value || 'Repertorio';

    indexPage.drawText(cleanPdfText('CANCIONES RECHUMADA'), {
      x: 50,
      y: PAGE_HEIGHT - 60,
      size: 20,
      font: fontBold,
      color: rgb(0.8, 0.4, 0.1)
    });

    indexPage.drawText(cleanPdfText(`${rawTitle.toUpperCase()} - ${rawSubtitle}`), {
      x: 50,
      y: PAGE_HEIGHT - 82,
      size: 11,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4)
    });

    indexPage.drawLine({
      start: { x: 50, y: PAGE_HEIGHT - 92 },
      end: { x: PAGE_WIDTH - 50, y: PAGE_HEIGHT - 92 },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8)
    });

    const songTargets = [];

    function createSongPage(sIdx, song, isContinued = false) {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      
      const songTitleClean = cleanPdfText(`${sIdx + 1}. ${song.title}${isContinued ? ' (cont.)' : ''}`);
      const artistClean = cleanPdfText(` - ${song.artist}`);

      page.drawText(songTitleClean, {
        x: 50,
        y: PAGE_HEIGHT - 45,
        size: 14,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1)
      });

      const titleWidth = fontBold.widthOfTextAtSize(songTitleClean + ' ', 14);
      page.drawText(artistClean, {
        x: 50 + titleWidth,
        y: PAGE_HEIGHT - 45,
        size: 12,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4)
      });

      let meta = song.capo > 0 ? `CAPO ${song.capo}` : `SIN CAPO`;
      if (song.notes) meta += ` | ${cleanPdfText(song.notes)}`;
      page.drawText(meta, {
        x: 50,
        y: PAGE_HEIGHT - 62,
        size: 9,
        font: fontBold,
        color: rgb(0.8, 0.4, 0.1)
      });

      const returnText = '< INDICE >';
      const returnX = PAGE_WIDTH - 110;
      const returnY = PAGE_HEIGHT - 52;
      page.drawText(returnText, {
        x: returnX,
        y: returnY,
        size: 10,
        font: fontBold,
        color: rgb(0.2, 0.4, 0.8)
      });

      try {
        const backLink = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [returnX - 4, returnY - 4, returnX + 60, returnY + 12],
          Border: [0, 0, 0],
          A: {
            Type: 'Action',
            S: 'GoTo',
            D: [indexPageRef, 'XYZ', null, null, null]
          }
        });
        page.node.set(PDFLib.PDFName.of('Annots'), pdfDoc.context.obj([backLink]));
      } catch (linkErr) {
        console.warn('Vínculo al índice omitido:', linkErr);
      }

      page.drawText(cleanPdfText(`Pág. ${pdfDoc.getPageCount()} | Rechumada`), {
        x: PAGE_WIDTH - 140,
        y: 22,
        size: 8,
        font: fontRegular,
        color: rgb(0.6, 0.6, 0.6)
      });

      return { page, currentY: PAGE_HEIGHT - 85 };
    }

    // 2. Renderizado de canciones
    for (let sIdx = 0; sIdx < AppState.setlist.length; sIdx++) {
      const song = AppState.setlist[sIdx];
      const explicitBlocks = (song.pages && song.pages.length > 0)
        ? song.pages
        : [{ page_num: 1, content: 'Sin contenido disponible' }];

      let firstPageRef = null;
      let firstPageNum = 0;

      for (let bIdx = 0; bIdx < explicitBlocks.length; bIdx++) {
        const rawContent = explicitBlocks[bIdx].content || '';
        const stanzas = splitIntoStanzas(rawContent);

        let isCont = bIdx > 0;
        let { page: currentPage, currentY } = createSongPage(sIdx, song, isCont);

        if (bIdx === 0) {
          firstPageRef = currentPage.ref;
          firstPageNum = pdfDoc.getPageCount();
        }

        for (let stIdx = 0; stIdx < stanzas.length; stIdx++) {
          const stanzaLines = stanzas[stIdx];
          const stanzaHeight = stanzaLines.length * LINE_HEIGHT + LINE_HEIGHT;

          if (currentY - stanzaHeight < MARGIN_BOTTOM && currentY < PAGE_HEIGHT - 120) {
            const next = createSongPage(sIdx, song, true);
            currentPage = next.page;
            currentY = next.currentY;
          }

          for (let lIdx = 0; lIdx < stanzaLines.length; lIdx++) {
            const line = stanzaLines[lIdx];
            const isChord = isChordLine(line);

            if (isChord && (currentY - (2 * LINE_HEIGHT) < MARGIN_BOTTOM)) {
              const next = createSongPage(sIdx, song, true);
              currentPage = next.page;
              currentY = next.currentY;
            } else if (currentY - LINE_HEIGHT < MARGIN_BOTTOM) {
              const next = createSongPage(sIdx, song, true);
              currentPage = next.page;
              currentY = next.currentY;
            }

            const sanitized = cleanPdfText(line);

            currentPage.drawText(sanitized, {
              x: 50,
              y: currentY,
              size: FONT_SIZE,
              font: isChord ? fontMonoBold : fontMono,
              color: isChord ? rgb(0.1, 0.45, 0.85) : rgb(0.15, 0.15, 0.15)
            });

            currentY -= LINE_HEIGHT;
          }

          currentY -= (LINE_HEIGHT * 0.8);
        }
      }

      songTargets.push({
        num: sIdx + 1,
        title: song.title,
        artist: song.artist,
        pageNumber: firstPageNum,
        targetRef: firstPageRef
      });
    }

    // 3. Escribir enlaces clicables en la página de Índice
    let indexY = PAGE_HEIGHT - 120;
    const indexAnnots = [];

    for (const item of songTargets) {
      if (indexY < 45) break;

      const itemTitle = cleanPdfText(`${item.num}. ${item.title} - ${item.artist}`);
      const pageNumStr = `${item.pageNumber}`;

      indexPage.drawText(itemTitle, {
        x: 50,
        y: indexY,
        size: 9.5,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1)
      });

      indexPage.drawText(pageNumStr, {
        x: PAGE_WIDTH - 70,
        y: indexY,
        size: 9.5,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1)
      });

      if (item.targetRef) {
        const linkAnnot = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [48, indexY - 3, PAGE_WIDTH - 50, indexY + 11],
          Border: [0, 0, 0],
          A: {
            Type: 'Action',
            S: 'GoTo',
            D: [item.targetRef, 'XYZ', null, null, null]
          }
        });
        indexAnnots.push(linkAnnot);
      }

      indexY -= 16;
    }

    if (indexAnnots.length > 0) {
      indexPage.node.set(PDFLib.PDFName.of('Annots'), pdfDoc.context.obj(indexAnnots));
    }

    btn.textContent = '💾 Descargando...';

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = downloadUrl;
    const safeFilename = rawTitle.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '_').replace(/(^_+|_+$)/g, '');
    a.download = `${safeFilename}_SETLIST.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

  } catch (error) {
    console.error('Error generando PDF:', error);
    alert('Hubo un error al generar el PDF:\n' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📄 Generar y Descargar PDF con Índice Interactivo';
  }
}

// Canciones iniciales de demostración en local
function getFallbackSongs() {
  return [
    {
      id: "ejemplo-1",
      title: "CANCIÓN DE PRUEBA 1",
      artist: "ARTISTA PRUEBA",
      capo: 0,
      notes: "",
      duration_min: 3.5,
      tags: ["Pop/Rock"],
      pages: [
        {
          page_num: 1,
          content: "G  Em  C  D\n(Líneas de prueba para verificar acordes y letra)\nG  Em  C  D"
        }
      ]
    }
  ];
}