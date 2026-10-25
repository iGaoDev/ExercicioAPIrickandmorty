/**
 * ============================================================================
 * RICK AND MORTY - MULTIVERSE EXPLORER
 * Arquitetura Modular em JavaScript Puro (ES6+)
 * Consumo da API: https://rickandmortyapi.com/
 * ============================================================================
 */

(() => {
  'use strict';

  // --- CONFIGURAÇÃO & ESTADO GLOBAL ---
  const CONFIG = {
    API_BASE: 'https://rickandmortyapi.com/api',
    DEBOUNCE_DELAY: 400,
    STORAGE_FAVORITES_KEY: 'rick_morty_portal_favorites_v1',
    STORAGE_SOUND_KEY: 'rick_morty_sound_enabled',
    TOTAL_KNOWN_CHARACTERS: 826
  };

  const state = {
    currentPage: 1,
    totalPages: 1,
    totalCharactersCount: 0,
    searchQuery: '',
    statusFilter: '',
    speciesFilter: '',
    genderFilter: '',
    activeTab: 'all', // 'all' | 'favorites'
    favorites: new Set(),
    soundEnabled: true,
    isLoading: false,
    episodeCache: new Map() // url -> episode name
  };

  // --- SERVIÇO DE ÁUDIO SINTÉTICO (Web Audio API) ---
  const AudioService = {
    ctx: null,

    init() {
      const stored = localStorage.getItem(CONFIG.STORAGE_SOUND_KEY);
      state.soundEnabled = stored === null ? true : stored === 'true';
      this.updateSoundButtonUI();
    },

    getAudioContext() {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    },

    toggleSound() {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem(CONFIG.STORAGE_SOUND_KEY, state.soundEnabled);
      this.updateSoundButtonUI();
      if (state.soundEnabled) {
        this.playPortalSound();
      }
      UI.showToast(state.soundEnabled ? '🔊 Efeitos sonoros ativados!' : '🔇 Efeitos sonoros desativados');
    },

    updateSoundButtonUI() {
      const btn = document.getElementById('soundToggleBtn');
      if (!btn) return;
      if (state.soundEnabled) {
        btn.classList.remove('muted');
        btn.title = 'Desativar Efeitos Sonoros';
      } else {
        btn.classList.add('muted');
        btn.title = 'Ativar Efeitos Sonoros';
      }
    },

    // Som de Portal Cósmico / Laser Whoosh
    playPortalSound() {
      if (!state.soundEnabled) return;
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.35);

        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } catch (e) {
        console.warn('Erro ao reproduzir áudio sintético:', e);
      }
    },

    // Som de Clique / Teletransporte
    playClickSound() {
      if (!state.soundEnabled) return;
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } catch (e) {
        console.warn('Erro ao reproduzir clique:', e);
      }
    },

    // Som de Favorito (brilho mágico)
    playFavSound() {
      if (!state.soundEnabled) return;
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const startTime = ctx.currentTime + (i * 0.05);

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, startTime);

          gain.gain.setValueAtTime(0.06, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(startTime);
          osc.stop(startTime + 0.2);
        });
      } catch (e) {
        console.warn('Erro ao reproduzir áudio de favorito:', e);
      }
    }
  };

  // --- SERVIÇO DE CONSUMO DA API RICK AND MORTY ---
  const ApiService = {
    // Busca personagens com parâmetros de paginação e filtros
    async getCharacters(params = {}) {
      const url = new URL(`${CONFIG.API_BASE}/character`);
      
      if (params.page) url.searchParams.set('page', params.page);
      if (params.name) url.searchParams.set('name', params.name.trim());
      if (params.status) url.searchParams.set('status', params.status);
      if (params.species) url.searchParams.set('species', params.species);
      if (params.gender) url.searchParams.set('gender', params.gender);

      try {
        const response = await fetch(url.toString());
        
        // Se a API retornar 404, significa que nenhum personagem atendeu aos critérios
        if (response.status === 404) {
          return { info: { count: 0, pages: 0 }, results: [] };
        }

        if (!response.ok) {
          throw new Error(`Erro de rede na API: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error('Falha ao obter personagens da API:', error);
        throw error;
      }
    },

    // Busca um único personagem por ID (ou múltiplos por array de IDs)
    async getCharacterById(id) {
      try {
        const response = await fetch(`${CONFIG.API_BASE}/character/${id}`);
        if (!response.ok) throw new Error('Personagem não encontrado');
        return await response.json();
      } catch (error) {
        console.error(`Erro ao buscar personagem ID ${id}:`, error);
        throw error;
      }
    },

    // Busca múltiplos personagens por lista de IDs (usado para favoritos)
    async getCharactersByIds(idsArray) {
      if (!idsArray || idsArray.length === 0) return [];
      try {
        const idQuery = idsArray.join(',');
        const response = await fetch(`${CONFIG.API_BASE}/character/${idQuery}`);
        if (!response.ok) throw new Error('Falha ao carregar favoritos');
        const data = await response.json();
        // A API retorna um único objeto se for apenas 1 ID, ou um array se forem múltiplos
        return Array.isArray(data) ? data : [data];
      } catch (error) {
        console.error('Erro ao buscar personagens favoritos:', error);
        return [];
      }
    },

    // Busca informações de episódios com sistema de cache em memória
    async getEpisodeDetails(url) {
      if (!url) return 'Desconhecido';
      if (state.episodeCache.has(url)) {
        return state.episodeCache.get(url);
      }

      try {
        const response = await fetch(url);
        if (!response.ok) return 'Episódio';
        const data = await response.json();
        const formatted = `${data.episode}: "${data.name}"`;
        state.episodeCache.set(url, formatted);
        return formatted;
      } catch (e) {
        return 'Episódio';
      }
    },

    // Carrega estatísticas globais (contagem de personagens, locais e episódios)
    async loadGlobalStats() {
      try {
        const [charRes, locRes, epRes] = await Promise.all([
          fetch(`${CONFIG.API_BASE}/character`),
          fetch(`${CONFIG.API_BASE}/location`),
          fetch(`${CONFIG.API_BASE}/episode`)
        ]);

        if (charRes.ok) {
          const charData = await charRes.json();
          document.getElementById('totalCharacters').textContent = `${charData.info.count}+`;
          state.totalCharactersCount = charData.info.count;
        }
        if (locRes.ok) {
          const locData = await locRes.json();
          document.getElementById('totalLocations').textContent = `${locData.info.count}+`;
        }
        if (epRes.ok) {
          const epData = await epRes.json();
          document.getElementById('totalEpisodes').textContent = `${epData.info.count}+`;
        }
      } catch (err) {
        console.warn('Não foi possível carregar estatísticas iniciais completas:', err);
      }
    }
  };

  // --- GERENCIADOR DE FAVORITOS (LOCALSTORAGE) ---
  const FavoritesManager = {
    init() {
      try {
        const stored = localStorage.getItem(CONFIG.STORAGE_FAVORITES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            state.favorites = new Set(parsed);
          }
        }
      } catch (e) {
        console.warn('Erro ao ler favoritos do localStorage:', e);
        state.favorites = new Set();
      }
      this.updateBadge();
    },

    isFavorite(id) {
      return state.favorites.has(Number(id));
    },

    toggle(id, characterName = 'Personagem') {
      const numId = Number(id);
      const wasFav = state.favorites.has(numId);

      if (wasFav) {
        state.favorites.delete(numId);
        UI.showToast(`⭐ ${characterName} removido da mochila!`);
      } else {
        state.favorites.add(numId);
        AudioService.playFavSound();
        UI.showToast(`✨ ${characterName} guardado nos favoritos!`);
      }

      this.save();
      this.updateBadge();
      UI.updateCardFavButtons(numId, !wasFav);

      // Se estivermos na aba de favoritos, re-renderizar para atualizar a lista
      if (state.activeTab === 'favorites') {
        App.loadFavoritesView();
      }
    },

    save() {
      try {
        localStorage.setItem(
          CONFIG.STORAGE_FAVORITES_KEY,
          JSON.stringify(Array.from(state.favorites))
        );
      } catch (e) {
        console.error('Erro ao salvar favoritos:', e);
      }
    },

    updateBadge() {
      const count = state.favorites.size;
      const countEl = document.getElementById('favoriteCount');
      const badgeEl = document.getElementById('favTabBadge');
      if (countEl) countEl.textContent = count;
      if (badgeEl) badgeEl.textContent = count;
    }
  };

  // --- SERVIÇO DE TRANSMISSÃO OFICIAL & REDIRECIONAMENTO ---
  const WatchService = {
    providers: {
      max: {
        name: 'Max (HBO Max)',
        url: 'https://play.max.com/show/ab553cdc-e15d-4597-b65f-bec9201fd2dd'
      },
      adultswim: {
        name: 'Adult Swim',
        url: 'https://www.adultswim.com/videos/rick-and-morty'
      },
      justwatch: {
        name: 'JustWatch Brasil',
        url: 'https://www.justwatch.com/br/serie/rick-and-morty'
      }
    },

    openModal() {
      AudioService.playPortalSound();
      if (UI.elements.watchModal) {
        UI.elements.watchModal.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
      }
    },

    closeModal() {
      if (UI.elements.watchModal) {
        UI.elements.watchModal.setAttribute('hidden', '');
        document.body.style.overflow = '';
      }
    }
  };

  // --- CONTROLADOR DE INTERFACE DO USUÁRIO (UI) ---
  const UI = {
    elements: {
      grid: document.getElementById('charactersGrid'),
      resultsCount: document.getElementById('resultsCount'),
      paginationNav: document.getElementById('paginationNav'),
      pageNumbers: document.getElementById('pageNumbers'),
      prevPageBtn: document.getElementById('prevPageBtn'),
      nextPageBtn: document.getElementById('nextPageBtn'),
      firstPageBtn: document.getElementById('firstPageBtn'),
      lastPageBtn: document.getElementById('lastPageBtn'),
      searchInput: document.getElementById('searchInput'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      statusFilter: document.getElementById('statusFilter'),
      speciesFilter: document.getElementById('speciesFilter'),
      genderFilter: document.getElementById('genderFilter'),
      resetFiltersBtn: document.getElementById('resetFiltersBtn'),
      tabAll: document.getElementById('tabAll'),
      tabFavorites: document.getElementById('tabFavorites'),
      controlsPanel: document.getElementById('controlsPanel'),
      characterModal: document.getElementById('characterModal'),
      modalContent: document.getElementById('modalContent'),
      modalCloseBtn: document.getElementById('modalCloseBtn'),
      watchModal: document.getElementById('watchModal'),
      watchModalCloseBtn: document.getElementById('watchModalCloseBtn'),
      watchBtn: document.getElementById('watchBtn'),
      heroWatchBtn: document.getElementById('heroWatchBtn'),
      toastContainer: document.getElementById('toastContainer'),
      randomCharBtn: document.getElementById('randomCharBtn'),
      soundToggleBtn: document.getElementById('soundToggleBtn')
    },

    // Tradução amigável dos valores de status
    formatStatus(status) {
      switch ((status || '').toLowerCase()) {
        case 'alive': return { label: 'Vivo', class: 'alive' };
        case 'dead': return { label: 'Morto', class: 'dead' };
        default: return { label: 'Desconhecido', class: 'unknown' };
      }
    },

    // Tradução de gênero
    formatGender(gender) {
      switch ((gender || '').toLowerCase()) {
        case 'female': return 'Feminino';
        case 'male': return 'Masculino';
        case 'genderless': return 'Sem Gênero';
        default: return 'Desconhecido';
      }
    },

    // Exibe ou oculta estado de carregamento
    setLoading(loading) {
      state.isLoading = loading;
      if (loading) {
        this.elements.resultsCount.innerHTML = '<span class="loading-indicator">🌀 Sintonizando Portal Gun...</span>';
        if (this.elements.grid) {
          this.elements.grid.style.opacity = '0.5';
          this.elements.grid.style.pointerEvents = 'none';
        }
      } else {
        if (this.elements.grid) {
          this.elements.grid.style.opacity = '1';
          this.elements.grid.style.pointerEvents = 'auto';
          this.elements.grid.style.display = 'grid';
        }
      }
    },

    // Renderiza a lista de cards de personagens
    renderCharacters(characters) {
      this.elements.grid.innerHTML = '';

      if (!characters || characters.length === 0) {
        this.elements.grid.style.display = 'none';
        this.elements.paginationNav.style.display = 'none';
        this.elements.resultsCount.innerHTML = `❌ <strong>Nenhum espécime encontrado nesta dimensão.</strong> Tente redefinir os filtros ou alterar a busca.`;
        return;
      }

      this.elements.grid.style.display = 'grid';
      this.elements.grid.style.opacity = '1';

      const fragment = document.createDocumentFragment();

      characters.forEach(char => {
        const card = document.createElement('article');
        card.className = 'character-card';
        card.setAttribute('data-id', char.id);
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Ver detalhes de ${char.name}`);

        const statusInfo = this.formatStatus(char.status);
        const isFav = FavoritesManager.isFavorite(char.id);

        card.innerHTML = `
          <div class="card-media">
            <span class="card-status-pill">
              <span class="status-dot ${statusInfo.class}"></span>
              ${statusInfo.label}
            </span>
            <button 
              type="button" 
              class="fav-btn ${isFav ? 'is-favorite' : ''}" 
              data-fav-id="${char.id}" 
              data-char-name="${this.escapeHtml(char.name)}" 
              title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"
              aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}"
            >
              ${isFav ? '★' : '☆'}
            </button>
            <img 
              src="${char.image}" 
              alt="${char.name}" 
              class="card-img" 
              loading="lazy"
              onerror="this.src='https://rickandmortyapi.com/api/character/avatar/19.jpeg'"
            />
          </div>
          <div class="card-body">
            <div class="card-title-group">
              <h3 class="card-name">${this.escapeHtml(char.name)}</h3>
              <span class="card-species">${this.escapeHtml(char.species)} ${char.type ? `(${this.escapeHtml(char.type)})` : ''}</span>
            </div>
            
            <div class="card-meta-list">
              <div class="meta-row">
                <span class="meta-label">Última Localização:</span>
                <span class="meta-val" title="${this.escapeHtml(char.location.name)}">${this.escapeHtml(char.location.name)}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Origem Planetária:</span>
                <span class="meta-val" title="${this.escapeHtml(char.origin.name)}">${this.escapeHtml(char.origin.name)}</span>
              </div>
            </div>

            <button type="button" class="card-action-btn" aria-hidden="true">
              <span>Examinar Ficha</span>
              <span>&rarr;</span>
            </button>
          </div>
        `;

        // Evento de clique para abrir o Modal
        card.addEventListener('click', (e) => {
          // Se clicou no botão de favoritar, não abre o modal
          if (e.target.closest('.fav-btn')) return;
          AudioService.playClickSound();
          App.openCharacterModal(char.id);
        });

        // Acessibilidade via teclado (Enter / Espaço)
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (e.target.closest('.fav-btn')) return;
            e.preventDefault();
            AudioService.playClickSound();
            App.openCharacterModal(char.id);
          }
        });

        fragment.appendChild(card);
      });

      this.elements.grid.appendChild(fragment);
    },

    // Atualiza o botão de favorito individual de um card na tela
    updateCardFavButtons(id, isFavorite) {
      const favBtns = document.querySelectorAll(`[data-fav-id="${id}"]`);
      favBtns.forEach(btn => {
        if (isFavorite) {
          btn.classList.add('is-favorite');
          btn.innerHTML = '★';
          btn.title = 'Remover dos favoritos';
        } else {
          btn.classList.remove('is-favorite');
          btn.innerHTML = '☆';
          btn.title = 'Adicionar aos favoritos';
        }
      });

      // Também sincroniza o botão dentro do Modal, se estiver aberto
      const modalFavBtn = document.getElementById('modalFavToggle');
      if (modalFavBtn && Number(modalFavBtn.getAttribute('data-id')) === Number(id)) {
        if (isFavorite) {
          modalFavBtn.classList.add('is-fav');
          modalFavBtn.innerHTML = '★ Salvo nos Favoritos';
        } else {
          modalFavBtn.classList.remove('is-fav');
          modalFavBtn.innerHTML = '☆ Adicionar aos Favoritos';
        }
      }
    },

    // Renderiza controles de paginação avançados
    renderPagination(currentPage, totalPages) {
      if (totalPages <= 1) {
        this.elements.paginationNav.style.display = 'none';
        return;
      }

      this.elements.paginationNav.style.display = 'flex';
      this.elements.prevPageBtn.disabled = currentPage <= 1;
      this.elements.firstPageBtn.disabled = currentPage <= 1;
      this.elements.nextPageBtn.disabled = currentPage >= totalPages;
      this.elements.lastPageBtn.disabled = currentPage >= totalPages;

      this.elements.pageNumbers.innerHTML = '';
      const fragment = document.createDocumentFragment();

      const pages = this.calculatePaginationRange(currentPage, totalPages);

      pages.forEach(p => {
        if (p === '...') {
          const ellipsis = document.createElement('span');
          ellipsis.className = 'page-ellipsis';
          ellipsis.textContent = '...';
          fragment.appendChild(ellipsis);
        } else {
          const btn = document.createElement('button');
          btn.className = `page-btn ${p === currentPage ? 'active' : ''}`;
          btn.textContent = p;
          btn.setAttribute('aria-label', `Ir para página ${p}`);
          if (p === currentPage) {
            btn.setAttribute('aria-current', 'page');
          }
          btn.addEventListener('click', () => {
            AudioService.playClickSound();
            App.goToPage(p);
          });
          fragment.appendChild(btn);
        }
      });

      this.elements.pageNumbers.appendChild(fragment);
    },

    // Lógica para gerar range de páginas (com reticências)
    calculatePaginationRange(current, total) {
      if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
      }

      const delta = 1;
      const range = [];
      const rangeWithDots = [];
      let l;

      for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
          range.push(i);
        }
      }

      for (let i of range) {
        if (l) {
          if (i - l === 2) {
            rangeWithDots.push(l + 1);
          } else if (i - l !== 1) {
            rangeWithDots.push('...');
          }
        }
        rangeWithDots.push(i);
        l = i;
      }

      return rangeWithDots;
    },

    // Renderiza os dados no Modal de Personagem
    renderModal(char, initialEpisodeName = 'Carregando...') {
      const statusInfo = this.formatStatus(char.status);
      const isFav = FavoritesManager.isFavorite(char.id);
      const episodeCount = char.episode ? char.episode.length : 0;

      this.elements.modalContent.innerHTML = `
        <div class="modal-grid">
          <div class="modal-media-col">
            <img src="${char.image}" alt="${char.name}" class="modal-img" />
          </div>
          <div class="modal-info-col">
            <div class="modal-header-info">
              <h2 class="modal-name" id="modalName">${this.escapeHtml(char.name)}</h2>
              <div class="modal-tags">
                <span class="modal-tag tag-status-${statusInfo.class}">
                  <span class="status-dot ${statusInfo.class}"></span>
                  Status: ${statusInfo.label}
                </span>
                <span class="modal-tag">Espécie: ${this.escapeHtml(char.species)}</span>
                <span class="modal-tag">Gênero: ${this.formatGender(char.gender)}</span>
              </div>
            </div>

            <div class="modal-details-grid">
              <div class="modal-field">
                <span class="modal-field-title">Planeta de Origem:</span>
                <span class="modal-field-val">${this.escapeHtml(char.origin.name)}</span>
              </div>
              <div class="modal-field">
                <span class="modal-field-title">Localização Atual:</span>
                <span class="modal-field-val">${this.escapeHtml(char.location.name)}</span>
              </div>
              <div class="modal-field">
                <span class="modal-field-title">Subespécie / Tipo:</span>
                <span class="modal-field-val">${char.type ? this.escapeHtml(char.type) : 'Não especificado'}</span>
              </div>
              <div class="modal-field">
                <span class="modal-field-title">Primeira Aparição:</span>
                <span class="modal-field-val" id="modalFirstEpisode">${this.escapeHtml(initialEpisodeName)}</span>
              </div>
            </div>

            <div class="modal-episodes-section">
              <div class="episodes-title">
                <span>Participação em Episódios</span>
                <span class="episodes-badge">${episodeCount} episódios no total</span>
              </div>
              <div class="episodes-list" id="modalEpisodesList">
                <span class="episode-chip">Carregando catálogo de transmissões...</span>
              </div>
            </div>

            <div class="modal-actions">
              <button 
                type="button" 
                id="modalFavToggle" 
                class="modal-fav-toggle ${isFav ? 'is-fav' : ''}" 
                data-id="${char.id}" 
                data-name="${this.escapeHtml(char.name)}"
              >
                ${isFav ? '★ Salvo nos Favoritos' : '☆ Adicionar aos Favoritos'}
              </button>
              <button 
                type="button" 
                id="modalWatchBtn" 
                class="modal-fav-toggle" 
                style="border-color: rgba(124, 58, 237, 0.4); background: rgba(124, 58, 237, 0.15); color: #c4b5fd;"
                title="Assistir aos episódios da série"
              >
                <span>▶ Onde Assistir</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // Evento de clique para o botão de favoritar dentro do modal
      const modalFavBtn = document.getElementById('modalFavToggle');
      modalFavBtn.addEventListener('click', () => {
        FavoritesManager.toggle(char.id, char.name);
      });

      // Evento de clique para abrir o Streaming a partir do modal do personagem
      const modalWatchBtn = document.getElementById('modalWatchBtn');
      if (modalWatchBtn) {
        modalWatchBtn.addEventListener('click', () => {
          WatchService.openModal();
        });
      }

      this.elements.characterModal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';

      // Carregar os episódios de forma assíncrona
      this.loadModalEpisodes(char.episode);
    },

    // Carrega a lista com os primeiros episódios
    async loadModalEpisodes(episodeUrls) {
      if (!episodeUrls || episodeUrls.length === 0) return;
      const listEl = document.getElementById('modalEpisodesList');
      const firstEpEl = document.getElementById('modalFirstEpisode');

      // Buscar os primeiros episódios (limite de 12 para performance)
      const subset = episodeUrls.slice(0, 12);
      try {
        const episodePromises = subset.map(url => ApiService.getEpisodeDetails(url));
        const episodeNames = await Promise.all(episodePromises);

        if (firstEpEl && episodeNames[0]) {
          firstEpEl.textContent = episodeNames[0];
        }

        if (listEl) {
          listEl.innerHTML = episodeNames
            .map(ep => `<span class="episode-chip">${this.escapeHtml(ep)}</span>`)
            .join('');

          if (episodeUrls.length > 12) {
            const extra = episodeUrls.length - 12;
            listEl.innerHTML += `<span class="episode-chip" style="color: var(--portal-neon);">+ ${extra} outros episódios</span>`;
          }
        }
      } catch (err) {
        if (listEl) listEl.innerHTML = `<span class="episode-chip">Transmissão interdimensional indisponível</span>`;
      }
    },

    closeModal() {
      this.elements.characterModal.setAttribute('hidden', '');
      document.body.style.overflow = '';
      this.elements.modalContent.innerHTML = '';
    },

    // Notificações Toast Flutuantes
    showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('role', 'alert');
      toast.innerHTML = `
        <span class="toast-icon">🛸</span>
        <span>${this.escapeHtml(message)}</span>
      `;
      this.elements.toastContainer.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 3500);
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  // --- EFEITO VISUAL DE FUNDO CÓSMICO (PORTAL DO RICK ANIMADO & FAÍSCAS DE ENERGIA) ---
  const CosmosCanvas = {
    canvas: document.getElementById('cosmosCanvas'),
    ctx: null,
    laserSparks: [],
    portalSpirals: [],
    stars: [],
    slimeBubbles: [],

    init() {
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      if (!this.ctx) return;

      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.createParticles();
      this.animate();
    },

    resize() {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    },

    getAnchors() {
      const w = this.canvas.width;
      const h = this.canvas.height;
      return {
        // Posição aproximada da ponta da Portal Gun do Rick
        gunX: w > 768 ? w * 0.38 : w * 0.25,
        gunY: w > 768 ? h * 0.43 : h * 0.45,
        // Posição central do vórtice do Portal verde
        portalX: w > 768 ? w * 0.72 : w * 0.65,
        portalY: w > 768 ? h * 0.36 : h * 0.38,
        portalRadius: Math.min(w, h) * 0.28
      };
    },

    createParticles() {
      this.laserSparks = [];
      this.portalSpirals = [];
      this.stars = [];
      this.slimeBubbles = [];

      // 1. Faíscas que viajam pelo raio laser
      for (let i = 0; i < 28; i++) {
        this.laserSparks.push({
          progress: Math.random(),
          speed: Math.random() * 0.012 + 0.008,
          size: Math.random() * 2.8 + 1.2,
          jitter: (Math.random() - 0.5) * 8
        });
      }

      // 2. Partículas que giram em espiral no vórtice do portal
      for (let i = 0; i < 45; i++) {
        this.portalSpirals.push({
          angle: Math.random() * Math.PI * 2,
          distance: Math.random() * 140 + 20,
          speed: (Math.random() * 0.03 + 0.015) * (Math.random() > 0.5 ? 1 : -1),
          radius: Math.random() * 2.5 + 1,
          color: Math.random() > 0.35 ? '#39ff14' : '#00f0ff',
          alpha: Math.random() * 0.7 + 0.3
        });
      }

      // 3. Estrelas cósmicas cintilantes
      for (let i = 0; i < 60; i++) {
        this.stars.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.8 + 0.2,
          delta: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1)
        });
      }

      // 4. Bolhas de slime radioativo subindo
      for (let i = 0; i < 18; i++) {
        this.slimeBubbles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height + this.canvas.height,
          radius: Math.random() * 3.5 + 1.5,
          speedY: Math.random() * 0.6 + 0.3,
          wobbleSpeed: Math.random() * 0.03 + 0.01,
          wobbleDist: Math.random() * 20 + 5,
          alpha: Math.random() * 0.4 + 0.2
        });
      }
    },

    animate() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      const { gunX, gunY, portalX, portalY, portalRadius } = this.getAnchors();

      // Desenhar Estrelas de fundo
      this.stars.forEach(s => {
        s.alpha += s.delta;
        if (s.alpha > 0.95 || s.alpha < 0.15) s.delta = -s.delta;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, s.alpha)})`;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        this.ctx.fill();
      });

      // Desenhar Faíscas no Raio da Portal Gun
      this.laserSparks.forEach(p => {
        p.progress += p.speed;
        if (p.progress >= 1) p.progress = 0;

        const curX = gunX + (portalX - gunX) * p.progress;
        const curY = gunY + (portalY - gunY) * p.progress + p.jitter;

        this.ctx.fillStyle = p.progress > 0.85 ? '#ffffff' : '#39ff14';
        this.ctx.shadowColor = '#39ff14';
        this.ctx.shadowBlur = 8;
        this.ctx.beginPath();
        this.ctx.arc(curX, curY, p.size, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      });

      // Desenhar Espiral de Energia do Portal
      const time = Date.now() * 0.002;
      this.portalSpirals.forEach(sp => {
        sp.angle += sp.speed;
        const dist = sp.distance * (portalRadius / 150);
        const px = portalX + Math.cos(sp.angle) * dist;
        const py = portalY + Math.sin(sp.angle) * dist * 0.9;

        this.ctx.fillStyle = sp.color;
        this.ctx.globalAlpha = sp.alpha * (0.8 + 0.2 * Math.sin(time + sp.angle));
        this.ctx.shadowColor = sp.color;
        this.ctx.shadowBlur = 10;
        this.ctx.beginPath();
        this.ctx.arc(px, py, sp.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1;
      });

      // Desenhar Bolhas de Slime Radioativo
      this.slimeBubbles.forEach(b => {
        b.y -= b.speedY;
        b.x += Math.sin(time + b.y * 0.02) * 0.5;

        if (b.y < -20) {
          b.y = this.canvas.height + 20;
          b.x = Math.random() * this.canvas.width;
        }

        this.ctx.fillStyle = `rgba(151, 206, 76, ${b.alpha})`;
        this.ctx.strokeStyle = `rgba(57, 255, 20, ${b.alpha * 1.5})`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      });

      requestAnimationFrame(() => this.animate());
    }
  };

  // --- CONTROLADOR PRINCIPAL DA APLICAÇÃO ---
  const App = {
    searchDebounceTimer: null,

    async init() {
      // 1. Inicializar serviços
      FavoritesManager.init();
      AudioService.init();
      CosmosCanvas.init();

      // 2. Carregar estatísticas do Hero
      ApiService.loadGlobalStats();

      // 3. Vincular eventos do usuário
      this.bindEvents();

      // 4. Carregar página inicial de personagens
      await this.loadCharacters();
    },

    bindEvents() {
      // Barra de Pesquisa com Debounce
      UI.elements.searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        UI.elements.clearSearchBtn.hidden = val.length === 0;

        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          state.searchQuery = val;
          state.currentPage = 1;
          this.loadCharacters();
        }, CONFIG.DEBOUNCE_DELAY);
      });

      // Botão Limpar Pesquisa
      UI.elements.clearSearchBtn.addEventListener('click', () => {
        UI.elements.searchInput.value = '';
        UI.elements.clearSearchBtn.hidden = true;
        state.searchQuery = '';
        state.currentPage = 1;
        this.loadCharacters();
        UI.elements.searchInput.focus();
      });

      // Filtros Select (Status, Espécie, Gênero)
      const handleFilterChange = () => {
        state.statusFilter = UI.elements.statusFilter.value;
        state.speciesFilter = UI.elements.speciesFilter.value;
        state.genderFilter = UI.elements.genderFilter.value;
        state.currentPage = 1;
        AudioService.playClickSound();
        this.loadCharacters();
      };

      UI.elements.statusFilter.addEventListener('change', handleFilterChange);
      UI.elements.speciesFilter.addEventListener('change', handleFilterChange);
      UI.elements.genderFilter.addEventListener('change', handleFilterChange);

      // Botão Resetar Filtros
      const resetAllFilters = () => {
        UI.elements.searchInput.value = '';
        UI.elements.clearSearchBtn.hidden = true;
        UI.elements.statusFilter.value = '';
        UI.elements.speciesFilter.value = '';
        UI.elements.genderFilter.value = '';

        state.searchQuery = '';
        state.statusFilter = '';
        state.speciesFilter = '';
        state.genderFilter = '';
        state.currentPage = 1;

        AudioService.playPortalSound();
        this.loadCharacters();
      };

      UI.elements.resetFiltersBtn.addEventListener('click', resetAllFilters);

      // Navegação por Abas (Todos vs Favoritos)
      UI.elements.tabAll.addEventListener('click', () => {
        if (state.activeTab === 'all') return;
        state.activeTab = 'all';
        UI.elements.tabAll.classList.add('active');
        UI.elements.tabAll.setAttribute('aria-selected', 'true');
        UI.elements.tabFavorites.classList.remove('active');
        UI.elements.tabFavorites.setAttribute('aria-selected', 'false');
        UI.elements.controlsPanel.style.display = 'flex';
        AudioService.playClickSound();
        this.loadCharacters();
      });

      UI.elements.tabFavorites.addEventListener('click', () => {
        if (state.activeTab === 'favorites') return;
        state.activeTab = 'favorites';
        UI.elements.tabFavorites.classList.add('active');
        UI.elements.tabFavorites.setAttribute('aria-selected', 'true');
        UI.elements.tabAll.classList.remove('active');
        UI.elements.tabAll.setAttribute('aria-selected', 'false');
        UI.elements.controlsPanel.style.display = 'none';
        AudioService.playClickSound();
        this.loadFavoritesView();
      });

      // Navegação de Paginação (Anterior / Próxima / Primeira / Última)
      UI.elements.prevPageBtn.addEventListener('click', () => {
        if (state.currentPage > 1) {
          AudioService.playClickSound();
          this.goToPage(state.currentPage - 1);
        }
      });

      UI.elements.nextPageBtn.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
          AudioService.playClickSound();
          this.goToPage(state.currentPage + 1);
        }
      });

      UI.elements.firstPageBtn.addEventListener('click', () => {
        if (state.currentPage !== 1) {
          AudioService.playClickSound();
          this.goToPage(1);
        }
      });

      UI.elements.lastPageBtn.addEventListener('click', () => {
        if (state.currentPage !== state.totalPages) {
          AudioService.playClickSound();
          this.goToPage(state.totalPages);
        }
      });

      // Clique de Delegação para Botões de Favorito nos Cards
      UI.elements.grid.addEventListener('click', (e) => {
        const favBtn = e.target.closest('.fav-btn');
        if (favBtn) {
          e.stopPropagation();
          const id = favBtn.getAttribute('data-fav-id');
          const name = favBtn.getAttribute('data-char-name');
          FavoritesManager.toggle(id, name);
        }
      });

      // Teletransporte Aleatório (Portal Gun)
      UI.elements.randomCharBtn.addEventListener('click', async () => {
        AudioService.playPortalSound();
        UI.showToast('🌀 Disparando Portal Gun para dimensão desconhecida...');
        
        // Gera um ID aleatório entre 1 e o total conhecido (ou 826)
        const maxId = state.totalCharactersCount || CONFIG.TOTAL_KNOWN_CHARACTERS;
        const randomId = Math.floor(Math.random() * maxId) + 1;
        
        await this.openCharacterModal(randomId);
      });

      // Alternar Efeitos Sonoros
      UI.elements.soundToggleBtn.addEventListener('click', () => {
        AudioService.toggleSound();
      });

      // Abrir Modal de Assistir Série
      if (UI.elements.watchBtn) {
        UI.elements.watchBtn.addEventListener('click', () => WatchService.openModal());
      }
      if (UI.elements.heroWatchBtn) {
        UI.elements.heroWatchBtn.addEventListener('click', () => WatchService.openModal());
      }

      // Fechar Watch Modal
      if (UI.elements.watchModalCloseBtn) {
        UI.elements.watchModalCloseBtn.addEventListener('click', () => WatchService.closeModal());
      }
      if (UI.elements.watchModal) {
        UI.elements.watchModal.addEventListener('click', (e) => {
          if (e.target === UI.elements.watchModal) {
            WatchService.closeModal();
          }
        });
      }

      // Feedback sonoro nos links de plataformas e temporadas
      document.querySelectorAll('.platform-link-btn, .season-pill').forEach(link => {
        link.addEventListener('click', () => {
          AudioService.playPortalSound();
          const targetName = link.textContent.trim();
          UI.showToast(`🛰️ Abrindo canal oficial: ${targetName}`);
        });
      });

      // Fechar Modal de Personagem
      UI.elements.modalCloseBtn.addEventListener('click', () => {
        UI.closeModal();
      });

      UI.elements.characterModal.addEventListener('click', (e) => {
        if (e.target === UI.elements.characterModal) {
          UI.closeModal();
        }
      });

      // Fechar Modais com Tecla Esc
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (UI.elements.watchModal && !UI.elements.watchModal.hasAttribute('hidden')) {
            WatchService.closeModal();
          } else if (UI.elements.characterModal && !UI.elements.characterModal.hasAttribute('hidden')) {
            UI.closeModal();
          }
        }
      });
    },

    // Carrega personagens da API respeitando filtros ativos
    async loadCharacters() {
      UI.setLoading(true);

      try {
        const data = await ApiService.getCharacters({
          page: state.currentPage,
          name: state.searchQuery,
          status: state.statusFilter,
          species: state.speciesFilter,
          gender: state.genderFilter
        });

        state.totalPages = data.info.pages || 0;
        const count = data.info.count || 0;

        // Feedback textual da busca
        if (count === 0) {
          UI.elements.resultsCount.textContent = 'Nenhuma variante cósmica encontrada.';
        } else {
          const filterTerms = [];
          if (state.searchQuery) filterTerms.push(`"${state.searchQuery}"`);
          if (state.statusFilter) filterTerms.push(`status: ${state.statusFilter}`);
          if (state.speciesFilter) filterTerms.push(`espécie: ${state.speciesFilter}`);
          if (state.genderFilter) filterTerms.push(`gênero: ${state.genderFilter}`);

          const filterDetail = filterTerms.length > 0 ? ` para [${filterTerms.join(', ')}]` : '';
          UI.elements.resultsCount.innerHTML = `Mostrando <strong>${data.results.length}</strong> de <strong>${count}</strong> indivíduos catalogados${filterDetail} (Página ${state.currentPage} de ${state.totalPages})`;
        }

        UI.renderCharacters(data.results);
        UI.renderPagination(state.currentPage, state.totalPages);
      } catch (err) {
        console.error('Erro na requisição da API:', err);
        UI.elements.resultsCount.innerHTML = '❌ Erro ao sintonizar a Portal Gun. Verifique sua conexão com o multiverso.';
        UI.renderCharacters([]);
      } finally {
        UI.setLoading(false);
      }
    },

    // Carrega visualização da aba de favoritos
    async loadFavoritesView() {
      const favIds = Array.from(state.favorites);

      if (favIds.length === 0) {
        UI.elements.resultsCount.innerHTML = '⭐ Sua mochila de favoritos está vazia. Clique na estrela ☆ de qualquer card para salvá-lo!';
        UI.elements.grid.style.display = 'none';
        UI.elements.paginationNav.style.display = 'none';
        return;
      }

      UI.setLoading(true);

      try {
        const characters = await ApiService.getCharactersByIds(favIds);
        UI.elements.resultsCount.innerHTML = `Mostrando <strong>${characters.length}</strong> viajante(s) salvo(s) nos seus favoritos.`;
        UI.renderCharacters(characters);
        UI.elements.paginationNav.style.display = 'none';
      } catch (err) {
        console.error('Erro ao buscar favoritos:', err);
        UI.elements.resultsCount.textContent = 'Erro ao carregar favoritos.';
      } finally {
        UI.setLoading(false);
      }
    },

    // Altera página atual e rola suavemente até o grid
    goToPage(page) {
      state.currentPage = page;
      this.loadCharacters();
      
      const target = document.getElementById('personagens');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },

    // Abre o Modal com informações do personagem
    async openCharacterModal(id) {
      try {
        const char = await ApiService.getCharacterById(id);
        UI.renderModal(char);
      } catch (err) {
        UI.showToast('Erro ao carregar dados do espécime selecionado.');
      }
    }
  };

  // Inicialização quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
})();
