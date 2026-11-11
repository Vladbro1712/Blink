import { useEffect, useMemo, useRef, useState } from 'react'
import { Heart, Home, ListMusic, Music2, Pause, Play, Search, Settings, SkipBack, SkipForward, Upload, Volume2, X } from 'lucide-react'
import './App.css'

type Platform = 'Spotify' | 'VK Музыка' | 'Яндекс Музыка'
type Track = { title: string; artist: string; cover: string; color: string; duration: string; src?: string; fileId?: string; image?: string; externalUrl?: string; uri?: string }
type SpotifyProfile = { display_name?: string | null; email?: string }
type SpotifyPlaybackState = { paused: boolean; position: number; duration: number; track_window?: { current_track?: { id: string; uri: string; name: string; duration_ms?: number; artists: Array<{ name: string }>; album: { images: Array<{ url: string }> } } } }
type SpotifyPlayer = {
  addListener: (event: string, callback: (payload: any) => void) => boolean
  connect: () => Promise<boolean>
  disconnect: () => void
  activateElement: () => Promise<void>
  togglePlay: () => Promise<void>
  seek: (positionMs: number) => Promise<void>
  setVolume: (volume: number) => Promise<void>
}
type SpotifySearchResponse = { tracks?: { items: Array<{ id: string; name: string; duration_ms: number; artists: Array<{ name: string }>; album: { images: Array<{ url: string }> }; external_urls: { spotify: string } }> } }
const platforms: Platform[] = ['Spotify', 'VK Музыка', 'Яндекс Музыка']
const tracks: Track[] = [
  { title: 'A Walk', artist: 'Tycho', cover: 'photo-1470225620780-dba8ba36b745', color: '#b9b5a9', duration: '5:16' },
  { title: 'Open Eye Signal', artist: 'Jon Hopkins', cover: 'photo-1519608487953-e999c86e7455', color: '#676a60', duration: '7:48' },
  { title: 'Kerala', artist: 'Bonobo', cover: 'photo-1470770841072-f978cf4d019e', color: '#848f78', duration: '3:57' },
  { title: 'Tadow', artist: 'Masego, FKJ', cover: 'photo-1500530855697-b586d89ba3ee', color: '#989279', duration: '5:02' },
  { title: 'Innerbloom', artist: 'RÜFÜS DU SOL', cover: 'photo-1470252649378-9c29740c9fa8', color: '#9c8274', duration: '9:38' },
  { title: 'Sunset Lover', artist: 'Petit Biscuit', cover: 'photo-1475924156734-496f6cac6ec1', color: '#aaa18a', duration: '3:57' },
]
const photo = (id: string) => `${import.meta.env.BASE_URL}covers/${id}.jpg`
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const spotifyClientId = '1720e78833f940348f746d417be3b00c'
const spotifyRedirectUri = 'http://127.0.0.1:43821/callback'
const spotifyMarket = 'RU'
const spotifySdkUrl = 'https://sdk.scdn.co/spotify-player.js'
const createRandomString = (length: number) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, value => alphabet[value % alphabet.length]).join('')
}
const createCodeChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const openLibrary = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('blink-audio-library', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('audio', { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

function App() {
  const [chosen, setChosen] = useState<Platform>(() => (localStorage.getItem('blink-platform') as Platform) || 'Spotify')
  const [screen, setScreen] = useState<'home' | 'favorites' | 'library' | 'settings'>('home')
  const [query, setQuery] = useState('')
  const [remember, setRemember] = useState(() => localStorage.getItem('blink-remember') !== 'false')
  const [showPicker, setShowPicker] = useState(() => !localStorage.getItem('blink-remember'))
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('blink-favorites') || '["A Walk","Kerala"]'))
  const [localTracks, setLocalTracks] = useState<Track[]>([])
  const [current, setCurrent] = useState<Track>(tracks[0])
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(70)
  const [spotifyConnected, setSpotifyConnected] = useState(false)
  const [spotifyBusy, setSpotifyBusy] = useState(false)
  const [spotifyProfile, setSpotifyProfile] = useState<SpotifyProfile | null>(null)
  const [spotifyTracks, setSpotifyTracks] = useState<Track[]>([])
  const [spotifyError, setSpotifyError] = useState('')
  const [spotifyPlayer, setSpotifyPlayer] = useState<SpotifyPlayer | null>(null)
  const [spotifyReady, setSpotifyReady] = useState(false)
  const [spotifySdkReady, setSpotifySdkReady] = useState(() => Boolean(window.Spotify))
  const spotifyDeviceIdRef = useRef('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const allTracks = useMemo(() => [...tracks, ...localTracks], [localTracks])
  const localTrackIds = useMemo(() => new Set(localTracks.map(t => t.fileId)), [localTracks])
  const filtered = useMemo(() => [...allTracks, ...spotifyTracks].filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase())), [allTracks, query, spotifyTracks])
  useEffect(() => { if (remember) localStorage.setItem('blink-platform', chosen) }, [chosen, remember])
  useEffect(() => { localStorage.setItem('blink-favorites', JSON.stringify(favoriteIds)) }, [favoriteIds])
  useEffect(() => { void openLibrary().then(db => { const request = db.transaction('audio').objectStore('audio').getAll(); request.onsuccess = () => setLocalTracks((request.result as Array<Track & { blob: Blob }>).map(({ blob, ...track }) => ({ ...track, src: URL.createObjectURL(blob) }))) }) }, [])
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume / 100 }, [volume])
  useEffect(() => { void window.blink?.spotify.status().then(async connected => { setSpotifyConnected(connected); if (connected) { try { setSpotifyProfile(await window.blink?.spotify.api('/me') as SpotifyProfile) } catch { setSpotifyConnected(false) } } }) }, [])
  useEffect(() => {
    if (window.Spotify) { setSpotifySdkReady(true); return }
    const script = document.createElement('script')
    script.src = spotifySdkUrl
    script.async = true
    script.onload = () => setSpotifySdkReady(true)
    script.onerror = () => setSpotifyError('Не удалось загрузить Web Playback SDK Spotify')
    document.body.appendChild(script)
    return () => { script.remove() }
  }, [])
  useEffect(() => { if (!audioRef.current || current.uri) return; if (playing) void audioRef.current.play().catch(() => setPlaying(false)); else audioRef.current.pause() }, [current, playing])
  useEffect(() => { if (!query.trim() || !spotifyConnected || !window.blink || chosen !== 'Spotify') { setSpotifyTracks([]); setSpotifyError(''); return } setSpotifyError(''); const timer = window.setTimeout(() => { void window.blink?.spotify.api(`/search?${new URLSearchParams({ q: query, type: 'track', limit: '10', market: spotifyMarket })}`).then(response => { const data = response as SpotifySearchResponse; setSpotifyTracks((data.tracks?.items || []).map(item => ({ title: item.name, artist: item.artists.map(artist => artist.name).join(', '), cover: tracks[0].cover, color: '#77786e', duration: formatTime(item.duration_ms / 1000), image: item.album.images[0]?.url, externalUrl: item.external_urls.spotify, uri: `spotify:track:${item.id}`, fileId: `spotify-${item.id}` }))) }).catch(error => { console.error(error); const detail = error instanceof Error ? error.message.replace(/^Error: /, '') : String(error); setSpotifyError(`Не удалось выполнить поиск Spotify: ${detail}`) }) }, 350); return () => window.clearTimeout(timer) }, [chosen, query, spotifyConnected])
  useEffect(() => {
    if (!spotifyConnected || !spotifySdkReady || !window.blink || !window.Spotify) return
    const player = new window.Spotify.Player({
      name: 'Blink',
      getOAuthToken: callback => { void window.blink?.spotify.token().then(callback).catch(error => setSpotifyError(error instanceof Error ? error.message : String(error))) },
      volume: 0.7,
      enableMediaSession: true,
    })
    player.addListener('ready', ({ device_id }: { device_id: string }) => { spotifyDeviceIdRef.current = device_id; setSpotifyReady(true) })
    player.addListener('not_ready', () => setSpotifyReady(false))
    player.addListener('authentication_error', ({ message }: { message: string }) => setSpotifyError(`Spotify: ${message}`))
    player.addListener('account_error', ({ message }: { message: string }) => setSpotifyError(`Spotify Premium нужен для воспроизведения: ${message}`))
    player.addListener('initialization_error', ({ message }: { message: string }) => setSpotifyError(`Web Playback SDK: ${message}`))
    player.addListener('playback_error', ({ message }: { message: string }) => setSpotifyError(`Spotify: ${message}`))
    player.addListener('player_state_changed', (state: SpotifyPlaybackState | null) => {
      if (!state) return
      setPlaying(!state.paused)
      setPosition(state.position / 1000)
      setDuration(state.duration / 1000)
      const track = state.track_window?.current_track
      if (track && track.id) setCurrent({ title: track.name, artist: track.artists.map(artist => artist.name).join(', '), cover: tracks[0].cover, color: '#77786e', duration: formatTime((track.duration_ms || state.duration) / 1000), image: track.album.images[0]?.url, externalUrl: `https://open.spotify.com/track/${track.id}`, uri: track.uri, fileId: `spotify-${track.id}` })
    })
    setSpotifyPlayer(player)
    void player.connect().then(connected => { if (!connected) setSpotifyError('Не удалось подключить Web Playback SDK') })
    return () => { player.disconnect(); setSpotifyPlayer(null); setSpotifyReady(false); spotifyDeviceIdRef.current = '' }
  }, [spotifyConnected, spotifySdkReady])
  useEffect(() => { if (spotifyPlayer && spotifyReady) void spotifyPlayer.setVolume(volume / 100) }, [spotifyPlayer, spotifyReady, volume])
  const pickPlatform = (platform: Platform) => { setChosen(platform); if (remember) { localStorage.setItem('blink-platform', platform); setShowPicker(false) } }
  const connectSpotify = async () => {
    if (!window.blink || spotifyBusy) return
    setSpotifyBusy(true)
    try {
      const codeVerifier = createRandomString(64)
      const state = createRandomString(32)
      const codeChallenge = await createCodeChallenge(codeVerifier)
      const authUrl = new URL('https://accounts.spotify.com/authorize')
      authUrl.search = new URLSearchParams({
        client_id: spotifyClientId,
        response_type: 'code',
        redirect_uri: spotifyRedirectUri,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        state,
        scope: 'user-read-private user-read-email user-read-currently-playing user-read-playback-state user-modify-playback-state streaming',
      }).toString()
      await window.blink.spotify.authenticate({ authUrl: authUrl.toString(), codeVerifier, state })
      setSpotifyConnected(true)
      setChosen('Spotify')
      setShowPicker(false)
    } catch (error) {
      console.error(error)
    } finally {
      setSpotifyBusy(false)
    }
  }
  const disconnectSpotify = async () => {
    await window.blink?.spotify.disconnect()
    setSpotifyConnected(false)
  }
  const toggleFavorite = (title: string) => setFavoriteIds(items => items.includes(title) ? items.filter(i => i !== title) : [...items, title])
  const togglePlayback = () => { if (current.uri && spotifyPlayer && spotifyReady) { void spotifyPlayer.togglePlay().catch(error => setSpotifyError(error instanceof Error ? error.message : String(error))); return } if (current.src) setPlaying(value => !value); else fileInputRef.current?.click() }
  const seekPlayback = (seconds: number) => { setPosition(seconds); if (current.uri && spotifyPlayer && spotifyReady) void spotifyPlayer.seek(seconds * 1000); else if (audioRef.current) audioRef.current.currentTime = seconds }
  const playTrack = (track: Track) => { if (track.uri && spotifyPlayer && spotifyReady) { void spotifyPlayer.activateElement().then(() => window.blink?.spotify.api('/me/player', { method: 'PUT', body: { device_ids: [spotifyDeviceIdRef.current] } })).then(() => window.blink?.spotify.api('/me/player/play', { method: 'PUT', body: { uris: [track.uri] } })).catch(error => setSpotifyError(error instanceof Error ? error.message : String(error))); return } if (track.externalUrl) { window.open(track.externalUrl, '_blank', 'noopener,noreferrer'); return } setCurrent(track); setPlaying(Boolean(track.src)); setPosition(0) }
  const importFiles = (files: FileList | null) => {
    if (!files) return
    const validFiles = Array.from(files).filter(file => file.type.startsWith('audio/'))
    if (!validFiles.length) return
    void openLibrary().then(db => {
      const transaction = db.transaction('audio', 'readwrite')
      const store = transaction.objectStore('audio')
      const imported = validFiles.map(file => {
        const fileId = `${file.name}-${file.size}-${file.lastModified}`
        const track = { title: file.name.replace(/\.[^.]+$/, ''), artist: 'Моя музыка', cover: tracks[0].cover, color: '#8a887a', duration: '0:00', fileId }
        if (!localTrackIds.has(fileId)) store.put({ ...track, id: fileId, blob: file })
        return { ...track, src: URL.createObjectURL(file) }
      }).filter(track => !localTrackIds.has(track.fileId))
      transaction.oncomplete = () => { setLocalTracks(items => [...imported, ...items]); if (imported[0]) playTrack(imported[0]) }
    })
  }
  const stepTrack = (direction: number) => {
    if (!allTracks.length) { fileInputRef.current?.click(); return }
    const index = allTracks.findIndex(track => track.fileId ? track.fileId === current.fileId : track.title === current.title)
    const next = allTracks[(index + direction + allTracks.length) % allTracks.length]
    playTrack(next)
  }
  const displayed = screen === 'favorites' ? filtered.filter(t => favoriteIds.includes(t.fileId || t.title)) : screen === 'library' ? filtered.filter(t => t.fileId && !t.externalUrl) : filtered

  return <main className="app">
    <aside className="sidebar">
      <button className="brand" onClick={() => setScreen('home')} aria-label="Blink — на главную"><span className="brand-mark"><Music2 size={19}/></span><span>blink<span className="brand-period">.</span></span></button>
      <div className="side-caption">МЕНЮ</div>
      <nav className="navigation">
        <button className={screen === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('home')}><Home size={17}/><span>Главная</span></button>
        <button className={screen === 'favorites' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('favorites')}><Heart size={17}/><span>Любимые</span><span className="nav-count">{favoriteIds.length}</span></button>
      </nav>
      <div className="sidebar-divider"/>
      <div className="side-caption">ВАША МУЗЫКА</div>
      <button className={screen === 'library' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('library')}><ListMusic size={17}/><span>Все треки</span></button>
      <div className="source-heading"><span className="side-caption">ПЛОЩАДКА</span><button title="Настроить площадки" onClick={() => setShowPicker(true)}><Settings size={15}/></button></div>
      <button className="source-active" onClick={() => setShowPicker(true)}><span className={`source-dot ${chosen === 'Spotify' ? 'spotify' : chosen === 'VK Музыка' ? 'vk' : 'yandex'}`}/><span>{chosen}</span><span className="source-selected"/></button>
      {platforms.filter(p => p !== chosen).map(p => <button className="source-inactive" key={p} onClick={() => setShowPicker(true)}><span className="source-dot disconnected"/><span>{p}</span></button>)}
      <div className="sidebar-bottom"><div className="sidebar-divider"/><button className={screen === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('settings')}><Settings size={17}/><span>Настройки</span></button><div className="profile"><div className="profile-avatar">B</div><div><strong>Гость</strong><span>Локальная коллекция</span></div><span className="profile-dots">···</span></div></div>
    </aside>

    <section className="main-column">
      <header className="topbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Треки, исполнители, альбомы"/><kbd>⌘ K</kbd>{query && <button className="clear-search" onClick={() => setQuery('')}><X size={15}/></button>}</div><button className="connect-button" onClick={() => setShowPicker(true)}><span className="connect-pulse"/> {chosen}</button></header>
      {screen === 'settings' ? <div className="content settings-content"><div className="eyebrow">МУЗЫКАЛЬНЫЕ СЕРВИСЫ</div><h1>Настройки</h1><p className="page-description">Управление музыкальными площадками и аккаунтами.</p><section className="settings-section"><div><h3>Музыкальные площадки</h3><p>Подключённые сервисы и аккаунты</p></div><button className="outline-button" onClick={() => setShowPicker(true)}>Настроить площадки</button></section></div> : <div className="content">
        {screen === 'home' || screen === 'library' ? <><div className="eyebrow">{screen === 'library' ? 'ВАША МУЗЫКА' : <>ПОДБРАНО ДЛЯ ВАС <span className="eyebrow-dot"/> {chosen.toUpperCase()}</>}</div><div className="welcome-row"><div><h1>{screen === 'library' ? <>Все треки<span>.</span></> : <>Чувствуй <span>момент.</span></>}</h1><p className="page-description">{screen === 'library' ? 'Ваша музыка с компьютера.' : 'Ваша музыка. Ваш ритм. Ваш Blink.'}</p></div>{screen === 'home' && <button className="date-label">ПОНЕДЕЛЬНИК, 10 НОЯБРЯ</button>}</div>
          {screen === 'home' && <section className="hero-feature" style={{backgroundImage:`linear-gradient(90deg,rgba(26,27,23,.72),rgba(30,29,24,.1)),url("${photo('photo-1470252649378-9c29740c9fa8')}")`}}><div className="hero-copy"><div className="hero-tag"><span/> ВЫБОР ДНЯ</div><h2>Найди свой<br/>тихий ритм.</h2><p>Музыка для моментов, когда хочется<br/>замедлиться и просто быть.</p><button className="hero-play" onClick={() => playTrack(tracks[0])}><Play size={15} fill="currentColor"/> Слушать подборку</button></div></section>}
          <section className="music-section"><div className="section-heading"><div><h2>{screen === 'library' ? 'Моя музыка' : 'Возможно, вам понравится'}</h2><p>{screen === 'library' ? `${localTracks.length} треков на этом устройстве` : 'Подборка и музыка с компьютера'}</p></div><button className="text-link import-link" onClick={() => fileInputRef.current?.click()}><Upload size={14}/> Добавить музыку</button><input ref={fileInputRef} className="visually-hidden" type="file" accept="audio/*" multiple onChange={event => { importFiles(event.target.files); event.target.value = '' }}/></div><div className="track-grid">{displayed.slice(0,screen === 'library' ? undefined : 6).map((track,i)=><article className="track-card" key={track.fileId || track.title}><div className="cover-wrap" style={{backgroundColor:track.color}}><img src={track.image || photo(track.cover)} alt="" loading="lazy"/><button className="cover-play" onClick={() => playTrack(track)} aria-label={`Играть ${track.title}`}><Play size={18} fill="currentColor"/></button><button className={favoriteIds.includes(track.fileId || track.title)?'track-heart liked':'track-heart'} onClick={() => toggleFavorite(track.fileId || track.title)} aria-label="Добавить в любимые"><Heart size={16} fill={favoriteIds.includes(track.fileId || track.title)?'currentColor':'none'}/></button><span className="track-index">0{i+1}</span></div><div className="track-details"><div><strong>{track.title}</strong><span>{track.artist}</span></div><button className="track-more" onClick={() => toggleFavorite(track.fileId || track.title)} aria-label="Добавить или убрать из любимых"><Heart size={15} fill={favoriteIds.includes(track.fileId || track.title)?'currentColor':'none'}/></button></div></article>)}</div>{spotifyProfile && <span className="spotify-profile">{spotifyProfile.display_name || spotifyProfile.email || 'Spotify подключён'}</span>}{spotifyError && <div className="empty-state">{spotifyError}</div>}</section>
        </> : screen === 'favorites' && <><div className="eyebrow">ВАША КОЛЛЕКЦИЯ <span className="eyebrow-dot"/> {chosen.toUpperCase()}</div><div className="welcome-row"><div><h1>Любимые<span>.</span></h1><p className="page-description">Всё, что хочется переслушать.</p></div></div><div className="favorite-banner"><Heart size={30}/><div><strong>{favoriteIds.length} трека</strong><span>из вашей коллекции {chosen}</span></div></div><section className="music-section"><div className="section-heading"><div><h2>Сохранённое</h2><p>Ваша личная подборка</p></div></div><div className="track-grid">{displayed.map((track,i)=><article className="track-card" key={track.title}><div className="cover-wrap" style={{backgroundColor:track.color}}><img src={track.image || photo(track.cover)} alt="" loading="lazy"/><button className="cover-play" onClick={() => playTrack(track)} aria-label={`Играть ${track.title}`}><Play size={18} fill="currentColor"/></button><button className="track-heart liked" onClick={() => toggleFavorite(track.fileId || track.title)} aria-label="Убрать из любимых"><Heart size={16} fill="currentColor"/></button><span className="track-index">0{i+1}</span></div><div className="track-details"><div><strong>{track.title}</strong><span>{track.artist}</span></div></div></article>)}</div>{displayed.length === 0 && <div className="empty-state">Здесь пока пусто. Добавляйте треки в любимые на главной.</div>}</section></>}
      </div>}
      <footer className="footer"><span>BLINK <span className="footer-dot">●</span> ВАША МУЗЫКА, ВАШИ ПРАВИЛА</span><span>СДЕЛАНО ДЛЯ МУЗЫКИ <Music2 size={12}/></span></footer>
    </section>
    <footer className="player"><audio ref={audioRef} src={current.src} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onLoadedMetadata={event => { const seconds = event.currentTarget.duration; if (Number.isFinite(seconds)) { setDuration(seconds); setCurrent(track => track.src === current.src ? { ...track, duration: formatTime(seconds) } : track) } }} onEnded={() => stepTrack(1)}/><div className="player-track"><img src={current.image || photo(current.cover)} alt=""/><div><strong>{current.title}</strong><span>{current.artist}</span></div><button className={favoriteIds.includes(current.fileId || current.title)?'player-heart liked':'player-heart'} onClick={() => toggleFavorite(current.fileId || current.title)} aria-label="В любимые"><Heart size={16} fill={favoriteIds.includes(current.title)?'currentColor':'none'}/></button></div><div className="player-controls"><div className="control-buttons"><button aria-label="Предыдущий трек" onClick={() => stepTrack(-1)}><SkipBack size={17} fill="currentColor"/></button><button className="main-play" aria-label={playing?'Пауза':'Играть'} onClick={togglePlayback}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><button aria-label="Следующий трек" onClick={() => stepTrack(1)}><SkipForward size={17} fill="currentColor"/></button></div><div className="timeline"><span>{formatTime(position)}</span><input className="seek-slider" type="range" min="0" max={duration} step="0.1" value={position} onChange={event => seekPlayback(Number(event.target.value))} aria-label="Позиция воспроизведения"/><span>{current.duration}</span></div></div><div className="player-volume"><Volume2 size={16}/><input type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} aria-label="Громкость"/></div></footer>
    {showPicker && <div className="modal-backdrop" onClick={() => setShowPicker(false)}><section className="source-modal" onClick={e => e.stopPropagation()}><div className="modal-top"><span className="eyebrow">ВАША МУЗЫКА, В ОДНОМ МЕСТЕ</span><button className="modal-close" onClick={() => setShowPicker(false)} aria-label="Закрыть"><X size={19}/></button></div><h2>Откуда начнём?</h2><p className="modal-description">Выберите музыкальную площадку</p><div className="platform-list">{platforms.map((p,i)=><button className={chosen===p?'platform-option selected':'platform-option'} onClick={() => pickPlatform(p)} key={p}><span className={`platform-logo p${i}`}>{i===0?'◉':i===1?'ᴠ':'Я'}</span><span className="platform-name"><strong>{p}</strong><span>{i===0?'Музыка со всего мира':i===1?'Музыка и подкасты':'Музыка для каждого дня'}</span></span><span className="status-soon">{i === 0 ? (spotifyConnected ? 'Подключён' : 'Не подключён') : 'Скоро'}</span></button>)}</div><label className="remember-check"><input type="checkbox" checked={remember} onChange={e => {setRemember(e.target.checked);localStorage.setItem('blink-remember',String(e.target.checked))}}/><span className="checkmark"/><span>Запомнить мой выбор</span></label><button className="modal-continue" onClick={() => chosen === 'Spotify' && !spotifyConnected ? void connectSpotify() : setShowPicker(false)} disabled={spotifyBusy}>{spotifyBusy ? 'Открываем Spotify…' : chosen === 'Spotify' && !spotifyConnected ? 'Подключить Spotify' : 'Продолжить'} <span>→</span></button><p className="modal-note">{spotifyConnected ? 'Spotify подключён для этого устройства' : 'Для закрытого бета-теста используется OAuth PKCE · Client Secret не нужен'}</p>{spotifyConnected && <button className="text-link" onClick={() => void disconnectSpotify()}>Отключить Spotify</button>}</section></div>}
  </main>
}
export default App
