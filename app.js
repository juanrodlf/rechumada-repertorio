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

// Sanitización de texto para fuentes estándar de PDF (evita excepciones WinAnsi)
function cleanPdfText(str) {
  if (!str) return '';
  return str
    .replace(/[áàäâ]/gi, 'a')
    .replace(/[éèëê]/gi, 'e')
    .replace(/[íìïî]/gi, 'i')
    .replace(/[óòöô]/gi, 'o')
    .replace(/[úùüû]/gi, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[Ñ]/g, 'N')
    .replace(/[¿¡]/g, '')
    .replace(/[“”""]/g, '"')
    .replace(/[’']/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[•]/g, '-')
    .replace(/[^\x20-\x7E\n\r\t]/g, '');
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
    btn.textContent = '⏳ Creando páginas del PDF...';

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
    const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;

    // 1. Página de Índice (Pág. 1)
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

    // 2. Renderizar canciones
    for (let sIdx = 0; sIdx < AppState.setlist.length; sIdx++) {
      const song = AppState.setlist[sIdx];
      const pagesData = (song.pages && song.pages.length > 0)
        ? song.pages
        : [{ page_num: 1, content: 'Sin contenido disponible' }];

      let firstPageRef = null;
      const firstPageNum = pdfDoc.getPageCount() + 1;

      for (let pIdx = 0; pIdx < pagesData.length; pIdx++) {
        const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        if (pIdx === 0) firstPageRef = page.ref;

        const songTitleClean = cleanPdfText(`${sIdx + 1}. ${song.title}`);
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

        // Botón [INDICE] para regresar
        const returnText = '[INDICE]';
        const returnX = PAGE_WIDTH - 105;
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
            Rect: [returnX - 4, returnY - 4, returnX + 55, returnY + 12],
            Border: [0, 0, 0],
            A: {
              Type: 'Action',
              S: 'GoTo',
              D: [indexPageRef, 'XYZ', null, null, null]
            }
          });
          page.node.set(PDFLib.PDFName.of('Annots'), pdfDoc.context.obj([backLink]));
        } catch (linkErr) {
          console.warn('Enlace al índice no insertado:', linkErr);
        }

        // Líneas de contenido
        const rawContent = pagesData[pIdx].content || '';
        const lines = rawContent.split('\n');
        let textY = PAGE_HEIGHT - 85;
        const fontSize = 9.5;
        const lineHeight = 13.5;

        for (const line of lines) {
          if (textY < 40) break;
          const sanitizedLine = cleanPdfText(line);
          const trimmed = sanitizedLine.trim();
          const isChord = /^[A-G][b#]?(?:m|maj|min|dim|aug|sus|[0-9])*(?:\s+[A-G][b#]?(?:m|maj|min|dim|aug|sus|[0-9])*)*\s*$/.test(trimmed);

          page.drawText(sanitizedLine, {
            x: 50,
            y: textY,
            size: fontSize,
            font: isChord ? fontMonoBold : fontMono,
            color: isChord ? rgb(0.1, 0.45, 0.85) : rgb(0.15, 0.15, 0.15)
          });
          textY -= lineHeight;
        }

        page.drawText(cleanPdfText(`Pag. ${pdfDoc.getPageCount()} | Rechumada`), {
          x: PAGE_WIDTH - 140,
          y: 22,
          size: 8,
          font: fontRegular,
          color: rgb(0.6, 0.6, 0.6)
        });
      }

      songTargets.push({
        num: sIdx + 1,
        title: song.title,
        artist: song.artist,
        pageNumber: firstPageNum,
        targetRef: firstPageRef
      });
    }

    // 3. Escribir enlaces en el Índice
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
    a.download = `${cleanPdfText(rawTitle).replace(/\s+/g, '_')}_SETLIST.pdf`;
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
      id: "en-algun-lugar",
      title: "EN ALGÚN LUGAR",
      artist: "DUNCAN DHU",
      capo: 0,
      notes: "",
      duration_min: 3.5,
      tags: ["Pop/Rock 80s-90s"],
      pages: [
        {
          page_num: 1,
          content: "INTRO [Em G D] x 2\n[Em Bm C G D Em Bm C]\n[G D Am C] x 2\n\nEm          G  D   Em    G D Em\nEn algun lugar de un gran pais\nEm          G  D   Em    G   D\nolvidaron construir\n            G               D\nun lugar donde no queme el sol\n         G                 Em    G D Em\ny al nacer no haya que morir\n\nBm             C       G D Em\nY en la sombra mueren genios sin saber\nBm             C\nde su magia concedida sin pedirlo\nG\nmucho tiempo antes de nacer"
        }
      ]
    },
    {
      id: "dejame",
      title: "DÉJAME",
      artist: "LOS SECRETOS",
      capo: 0,
      notes: "",
      duration_min: 3.5,
      tags: ["Pop/Rock 80s-90s"],
      pages: [
        {
          page_num: 1,
          content: "G  Em   C    D  (x2)\n\nG   Em  C           D\nDéjame, no juegues más conmigo.\nG   Em  C           D\nEsta vez en serio te lo digo.\nAm          D        G   Em\nTuviste una oportunidad\nAm          F        D\ny la dejaste escapar.\n\nG   Em  C           D\nDéjame, no vuelvas a mi lado.\nG   Em  C           D\nUna vez estuve equivocado,\nAm          D        G  Em\npero ahora todo eso pasó,\nAm          D        G   G7\nno queda nada de ese amor."
        }
      ]
    }
  ];
}
