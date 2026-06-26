<template>
  <q-page class="player-page">
    <!-- ===== REPRODUCTOR MULTIMEDIA DE FONDO ===== -->
    <div class="media-container">
      <template v-if="playlist.length > 0">
        <!-- Video Player -->
        <video
          v-if="currentAd && currentAd.type === 'video'"
          ref="videoPlayer"
          class="fullscreen-media"
          :src="currentAd.url"
          autoplay
          muted
          playsinline
          @ended="nextAd"
          @error="onVideoError"
        ></video>

        <!-- Image Player -->
        <img
          v-else-if="currentAd && currentAd.type === 'image'"
          class="fullscreen-media"
          :src="currentAd.url"
          alt="Publicidad"
        />
      </template>

      <!-- Pantalla por defecto si no hay anuncios -->
      <div v-else class="default-bg flex flex-center">
        <div class="text-center">
          <q-icon name="local_pharmacy" size="100px" color="white" class="pharmacy-pulse" />
          <div class="text-h3 text-white q-mt-md font-weight-bold">SANTIDAD-DIVINA S.R.L.</div>
          <div class="text-subtitle1 text-grey q-mt-sm">FARMACIA</div>
        </div>
      </div>
    </div>

    <!-- ===== SUPERPOSICIÓN DE VERIFICACIÓN DE CLIENTE (PRIMER PLANO) ===== -->
    <div class="overlay-container" v-if="clientData.visible || showThanks">
      
      <!-- Pantalla de Gracias -->
      <div class="thanks-screen" v-if="showThanks">
        <div class="thanks-check q-mx-auto">
          <svg viewBox="0 0 52 52" class="check-svg">
            <circle class="check-circle" cx="26" cy="26" r="25" fill="none"/>
            <path class="check-path" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
        </div>
        <div class="thanks-title">¡Gracias por su compra!</div>
        <div class="thanks-sub">Farmacia SANTIDAD-DIVINA S.R.L. le desea un excelente día</div>
        <div class="thanks-dots">
          <span class="dot" v-for="n in 3" :key="n" :style="{ animationDelay: (n * 0.2) + 's' }"></span>
        </div>
      </div>

      <!-- Pantalla de Datos del Cliente -->
      <div class="client-card" v-else>
        <!-- Header -->
        <div class="display-header q-mb-md">
          <div class="pharmacy-logo">
            <q-icon name="local_pharmacy" size="38px" color="white" />
          </div>
          <div class="pharmacy-info">
            <div class="pharmacy-name">SANTIDAD-DIVINA S.R.L.</div>
            <div class="pharmacy-tag">FARMACIA</div>
          </div>
        </div>

        <div class="card-title-container q-mb-sm">
          <q-icon name="person_outline" size="22px" style="color: #1b3a5c" />
          <span class="card-title">Datos de Facturación</span>
          <div class="status-badge" :class="{ active: hasClientData }">
            <div class="status-dot"></div>
            {{ hasClientData ? 'Verificando' : 'Esperando' }}
          </div>
        </div>

        <div class="card-line q-mb-md"></div>

        <div class="data-list" v-if="hasClientData">
          <div class="data-row" v-if="clientData.tipoDocumento">
            <div class="row-icon"><q-icon name="description" size="20px" /></div>
            <div class="row-body">
              <div class="row-label">Tipo de Documento</div>
              <div class="row-value">{{ clientData.tipoDocumento }}</div>
            </div>
          </div>

          <div class="data-row">
            <div class="row-icon accent"><q-icon name="fingerprint" size="20px" /></div>
            <div class="row-body">
              <div class="row-label">NIT / Carnet de Identidad</div>
              <div class="row-value bold">{{ clientData.numeroDocumento || '—' }}</div>
            </div>
          </div>

          <div class="data-row" v-if="clientData.complemento">
            <div class="row-icon"><q-icon name="add_circle_outline" size="20px" /></div>
            <div class="row-body">
              <div class="row-label">Complemento</div>
              <div class="row-value">{{ clientData.complemento }}</div>
            </div>
          </div>

          <div class="data-row">
            <div class="row-icon accent"><q-icon name="store" size="20px" /></div>
            <div class="row-body">
              <div class="row-label">Nombre / Razón Social</div>
              <div class="row-value bold">{{ clientData.nombreRazonSocial || '—' }}</div>
            </div>
          </div>

          <div class="data-row" v-if="clientData.email">
            <div class="row-icon"><q-icon name="alternate_email" size="20px" /></div>
            <div class="row-body">
              <div class="row-label">Correo Electrónico</div>
              <div class="row-value">{{ clientData.email }}</div>
            </div>
          </div>
        </div>

        <!-- Estado de espera local -->
        <div class="waiting-state" v-else>
          <q-icon name="medical_information" size="64px" class="waiting-icon" />
          <div class="waiting-text">Confirmando datos en caja...</div>
          <div class="waiting-sub">Los datos de facturación aparecerán aquí para su validación</div>
        </div>

        <!-- Footer -->
        <div class="display-footer q-mt-lg">
          <div class="footer-left">
            <q-icon name="verified" size="14px" />
            Por favor, confirme que sus datos estén correctos con el cajero
          </div>
          <div class="footer-right">{{ currentTime }}</div>
        </div>
      </div>
    </div>

    <div v-if="!playlist.length && !isDownloading" class="flex flex-center" style="height: 100vh;">
      <h1 class="text-white text-h2 text-weight-bold">
        Esperando Publicidad...
      </h1>
    </div>

    <!-- Indicador de Descarga -->
    <div v-if="isDownloading" class="absolute-top-right q-pa-md text-white" style="z-index: 1000; background: rgba(0,0,0,0.5); border-radius: 0 0 0 10px;">
      <q-spinner-dots size="2rem" color="primary" />
      <span class="q-ml-sm">Descargando medios...</span>
    </div>

    <!-- ===== CONFIGURACIÓN / LOGIN INICIAL (MODAL) ===== -->
    <q-dialog v-model="showConfigModal" persistent transition-show="scale" transition-hide="scale">
      <q-card class="config-card q-pa-lg">
        <q-card-section class="text-center">
          <q-icon name="settings" size="48px" color="primary" class="q-mb-sm" />
          <div class="text-h6 text-primary text-bold">Configuración del Terminal PC</div>
          <div class="text-caption text-grey">Establezca los parámetros de red para el reproductor</div>
        </q-card-section>

        <q-card-section class="q-gutter-md">
          <!-- IP Laravel Server -->
          <q-input
            v-model="config.serverIp"
            label="Servidor Laravel (Laragon)"
            placeholder="http://192.168.100.2:8000"
            filled
            dense
            hint="Ejemplo: http://192.168.100.2:8000"
          />

          <!-- IP Sockets Server -->
          <q-input
            v-model="config.socketIp"
            label="Servidor de WebSockets (Sockets)"
            placeholder="http://192.168.100.2:3000"
            filled
            dense
            hint="Ejemplo: http://192.168.100.2:3000"
          />

          <!-- Cargar Agencias -->
          <div class="row items-center q-gutter-sm">
            <q-btn
              label="Conectar y Cargar Sucursales"
              color="secondary"
              dense
              flat
              icon="sync"
              @click="fetchAgencias"
              class="col-12"
            />
          </div>

          <!-- Agencia selector -->
          <q-select
            v-model="config.agencia"
            :options="agencias"
            option-value="id"
            option-label="nombre"
            label="Seleccionar Sucursal / Agencia"
            filled
            dense
            emit-value
            map-options
            :loading="loadingAgencias"
            hint="Opcional: Si se deja vacío, se mostrará publicidad global"
          />
        </q-card-section>

        <q-card-actions align="right" class="q-mt-md">
          <q-btn label="Guardar y Ejecutar" color="primary" @click="saveConfiguration" class="full-width" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Botón flotante invisible en esquina superior izquierda para re-configurar (hover) o presionando Esc -->
    <div class="settings-gear" @click="openConfig">
      <q-btn round flat icon="settings" color="white" size="sm" />
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { io } from 'socket.io-client'

// Configuración general
const configured = ref(false)
const showConfigModal = ref(false)
const loadingAgencias = ref(false)

const config = ref({
  serverIp: 'http://192.168.100.2:8000',
  socketIp: 'http://192.168.100.2:3000',
  agencia: null
})

const agencias = ref([])

// Datos de publicidad
const playlist = ref([])
const currentIndex = ref(0)
const imageTimer = ref(null)

// Datos del cliente en caja
const clientData = ref({
  numeroDocumento: '',
  complemento: '',
  nombreRazonSocial: '',
  email: '',
  tipoDocumento: '',
  visible: false
})
const showThankYouAnim = ref(false)
const isDownloading = ref(false)

// Reloj y Socket
const currentTime = ref('')
let clockInterval = null
let socketConn = null
let watchdogTimer = null

const currentAd = computed(() => {
  if (playlist.value.length === 0) return null
  return playlist.value[currentIndex.value]
})

const hasClientData = computed(() => {
  return clientData.value.numeroDocumento &&
    clientData.value.numeroDocumento !== '' &&
    clientData.value.numeroDocumento !== '0'
})

// === MÉTODOS ===

// Hora de Bolivia
function updateTime () {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Cargar agencias desde el backend Laravel
async function fetchAgencias () {
  if (!config.value.serverIp) return
  loadingAgencias.value = true
  try {
    const cleanIp = config.value.serverIp.replace(/\/$/, '')
    const response = await fetch(`${cleanIp}/api/sucursales`)
    if (response.ok) {
      const data = await response.json()
      agencias.value = data
    }
  } catch (error) {
    console.error('Error fetching sucursales:', error)
  } finally {
    loadingAgencias.value = false
  }
}

// Cargar datos locales de localStorage
function loadLocalConfig () {
  const savedServer = localStorage.getItem('pcpubli_server_ip')
  const savedSocket = localStorage.getItem('pcpubli_socket_ip')
  const savedAgencia = localStorage.getItem('pcpubli_agencia_id')

  if (savedServer && savedSocket) {
    config.value.serverIp = savedServer
    config.value.socketIp = savedSocket
    config.value.agencia = savedAgencia ? parseInt(savedAgencia, 10) : null
    configured.value = true
    return true
  }
  return false
}

// Guardar y aplicar configuración
function saveConfiguration () {
  if (!config.value.serverIp || !config.value.socketIp) return

  localStorage.setItem('pcpubli_server_ip', config.value.serverIp)
  localStorage.setItem('pcpubli_socket_ip', config.value.socketIp)
  if (config.value.agencia) {
    localStorage.setItem('pcpubli_agencia_id', config.value.agencia.toString())
  } else {
    localStorage.removeItem('pcpubli_agencia_id')
  }

  configured.value = true
  showConfigModal.value = false

  // Inicializar todo
  initSocket()
  fetchPlaylist()
}

function openConfig () {
  fetchAgencias()
  showConfigModal.value = true
}

// Obtener playlist de publicidad
async function fetchPlaylist () {
  if (!configured.value) return
  if (isDownloading.value) return // Prevenir múltiples descargas simultáneas
  try {
    const cleanIp = config.value.serverIp.replace(/\/$/, '')
    const url = new URL(`${cleanIp}/api/publicidad-actual`)
    if (config.value.agencia) {
      url.searchParams.append('agencia_id', config.value.agencia.toString())
    }

    const response = await fetch(url)
    if (response.ok) {
      let data = await response.json()
      if (Array.isArray(data)) {
        const newIds = data.map(d => d.file_id)
        const oldIds = playlist.value.map(d => d.file_id)

        // Si la playlist cambió, procesar descargas
        if (newIds.join(',') !== oldIds.join(',')) {
          isDownloading.value = true
          console.log('Nuevos archivos detectados, limpiando y descargando...')

          // Limpiar archivos locales viejos
          if (window.mediaAPI) {
            await window.mediaAPI.cleanup(newIds)
          }

          // Descargar los nuevos archivos
          for (const ad of data) {
            if (window.mediaAPI) {
              await window.mediaAPI.download(ad.file_id, ad.type)
              // Asignar ruta local para reproducción
              const ext = ad.type === 'video' ? 'mp4' : 'jpg'
              ad.url = `localmedia://publicidad_${ad.file_id}.${ext}`
            } else {
               // Fallback por si no estamos en Electron
               // Construir URL remota (como antes)
               const ext = ad.type === 'video' ? 'mp4' : 'jpg'
               ad.url = `${cleanIp}/uploads/publicidad/publicidad_${ad.file_id}.${ext}`
            }
          }

          playlist.value = data
          currentIndex.value = 0
          playCurrentAd()
          isDownloading.value = false
        }
      } else {
        // La API retornó objeto de "no hay publicidad"
        playlist.value = []
        clearImageTimer()
        if (window.mediaAPI) {
          await window.mediaAPI.cleanup([]) // Borrar todo local
        }
      }
    }
  } catch (err) {
    console.error('Error fetching playlist:', err)
    isDownloading.value = false
  }
}

// Iniciar bucle de reproducción
function playCurrentAd () {
  clearImageTimer()
  if (playlist.value.length === 0) return

  const ad = currentAd.value
  if (!ad) return

  if (ad.type === 'video') {
    nextTick(() => {
      const video = document.querySelector('video')
      if (video) {
        video.load()
        video.play().catch(e => {
          console.log('Autoplay blocked:', e)
        })
      }
    })
  } else {
    // Es una imagen, dura 10 segundos
    imageTimer.value = setTimeout(() => {
      nextAd()
    }, 10000)
  }
}

function nextAd () {
  if (playlist.value.length === 0) return
  currentIndex.value = (currentIndex.value + 1) % playlist.value.length
  playCurrentAd()
}

function clearImageTimer () {
  if (imageTimer.value) {
    clearTimeout(imageTimer.value)
    imageTimer.value = null
  }
}

function onVideoError (e) {
  console.error('Video error playing ad:', e)
  nextAd()
}

// Configurar WebSockets
function initSocket () {
  if (socketConn) {
    socketConn.disconnect()
  }

  const cleanSocketUrl = config.value.socketIp.replace(/\/$/, '')
  socketConn = io(cleanSocketUrl)

  socketConn.on('connect', () => {
    console.log('Socket conectado con éxito:', socketConn.id)
  })

  // Escuchar actualizaciones de publicidad
  socketConn.on('new_publicidad', () => {
    console.log('Nueva publicidad recibida')
    fetchPlaylist()
  })

  // Escuchar sincronización de datos de facturación
  socketConn.on('clienteDisplayData', (data) => {
    console.log('Datos del cliente recibidos por socket:', data)
    if (data) {
      clientData.value = data
      resetWatchdog()
    }
  })

  // Escuchar finalización de venta exitosa
  socketConn.on('clienteSaleComplete', () => {
    console.log('Venta completada con éxito!')
    showThankYou()
  })

  // Escuchar cierre de la pantalla de facturación
  socketConn.on('clienteDisplayClose', () => {
    console.log('Cierre gracefully solicitado')
    closeGracefully()
  })

  // Escuchar latido del cajero
  socketConn.on('clienteDisplayHeartbeat', () => {
    resetWatchdog()
  })
}

// Watchdog para ocultar la tarjeta de cliente si el cajero se desconecta o cierra de golpe
function resetWatchdog () {
  if (watchdogTimer) clearTimeout(watchdogTimer)
  watchdogTimer = setTimeout(() => {
    console.log('Watchdog expirado, cerrando pantalla de cliente por inactividad')
    closeGracefully()
  }, 10000) // 10 segundos de tolerancia sin heartbeat
}

function closeGracefully () {
  if (watchdogTimer) clearTimeout(watchdogTimer)
  
  // Si había datos de cliente activos (venta completada con éxito)
  if (hasClientData.value && clientData.value.visible) {
    showThankYou()
  } else {
    // Cerrar inmediatamente
    clearClientState()
  }
}

function showThankYou () {
  showThanks.value = true
  setTimeout(() => {
    showThanks.value = false
    clearClientState()
  }, 5000)
}

function clearClientState () {
  clientData.value = {
    numeroDocumento: '',
    complemento: '',
    nombreRazonSocial: '',
    email: '',
    tipoDocumento: '',
    visible: false
  }
}

// Atajo de teclado (Esc) para abrir configuración
function handleKeyPress (e) {
  if (e.key === 'Escape') {
    openConfig()
  }
}

// === LIFECYCLE HOOKS ===

onMounted(() => {
  updateTime()
  clockInterval = setInterval(updateTime, 1000)
  window.addEventListener('keydown', handleKeyPress)

  const exists = loadLocalConfig()
  if (exists) {
    initSocket()
    fetchPlaylist()
  } else {
    showConfigModal.value = true
  }
})

onBeforeUnmount(() => {
  if (clockInterval) clearInterval(clockInterval)
  if (imageTimer.value) clearTimeout(imageTimer.value)
  if (watchdogTimer) clearTimeout(watchdogTimer)
  if (socketConn) socketConn.disconnect()
  window.removeEventListener('keydown', handleKeyPress)
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');

.player-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #000;
  position: relative;
  font-family: 'Outfit', sans-serif;
}

/* ===== REPRODUCTOR MULTIMEDIA ===== */
.media-container {
  width: 100vw;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.fullscreen-media {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background-color: #000;
}

.default-bg {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1b3a5c 0%, #0d1e30 100%);
}

.pharmacy-pulse {
  animation: logoPulse 2.5s infinite ease-in-out;
}

@keyframes logoPulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.08); opacity: 1; }
}

/* ===== SUPERPOSICIONES EN PRIMER PLANO ===== */
.overlay-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(13, 30, 48, 0.45); /* Backdrop glassmorphism */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  animation: overlayFadeIn 0.5s ease forwards;
}

@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Tarjeta del cliente */
.client-card {
  width: 90%;
  max-width: 680px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(27, 58, 92, 0.1);
  border-radius: 24px;
  padding: 32px 38px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.3),
    0 1px 3px rgba(0, 0, 0, 0.1);
  animation: cardSlideUp 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

@keyframes cardSlideUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.display-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pharmacy-logo {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1b3a5c, #2a5f8f);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(27,58,92,0.3);
}

.pharmacy-info {
  display: flex;
  flex-direction: column;
}

.pharmacy-name {
  font-size: 24px;
  font-weight: 800;
  color: #1b3a5c;
  letter-spacing: 0.5px;
  line-height: 1.2;
}

.pharmacy-tag {
  font-size: 10px;
  font-weight: 700;
  color: #64b5e2;
  letter-spacing: 4px;
  margin-top: 2px;
}

.card-title-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-title {
  font-size: 17px;
  font-weight: 700;
  color: #1b3a5c;
  flex: 1;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #888;
  padding: 4px 14px;
  border-radius: 20px;
  background: #eaeaea;
  transition: all 0.4s ease;
}

.status-badge.active {
  color: #1b3a5c;
  background: rgba(100, 181, 226, 0.15);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #bbb;
  transition: all 0.4s ease;
}

.status-badge.active .status-dot {
  background: #64b5e2;
  animation: dotBreathe 1.5s infinite ease-in-out;
}

@keyframes dotBreathe {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.card-line {
  height: 1.5px;
  background: linear-gradient(90deg, rgba(27, 58, 92, 0.15), rgba(100, 181, 226, 0.1), transparent);
}

/* Listado de datos */
.data-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.data-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 14px;
  background: #f4f8fc;
  border: 1px solid rgba(27, 58, 92, 0.04);
}

.row-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #e9eff5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7da5c4;
  flex-shrink: 0;
}

.row-icon.accent {
  background: linear-gradient(135deg, #e6f1fa, #cbe2f3);
  color: #1b3a5c;
}

.row-body {
  flex: 1;
}

.row-label {
  font-size: 11px;
  font-weight: 700;
  color: #7da5c4;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 2px;
}

.row-value {
  font-size: 19px;
  font-weight: 500;
  color: #1b3a5c;
  word-break: break-all;
}

.row-value.bold {
  font-size: 23px;
  font-weight: 800;
}

/* Pantalla de gracias */
.thanks-screen {
  text-align: center;
  padding: 40px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 28px;
  box-shadow: 0 15px 50px rgba(0, 0, 0, 0.35);
  animation: cardSlideUp 0.6s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

.thanks-check {
  width: 100px;
  height: 100px;
  margin-bottom: 24px;
}

.check-svg {
  width: 100%;
  height: 100%;
}

.check-circle {
  stroke: #64b5e2;
  stroke-width: 2.5;
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  animation: circleAnim 0.6s ease 0.1s forwards;
}

@keyframes circleAnim {
  to { stroke-dashoffset: 0; }
}

.check-path {
  stroke: #1b3a5c;
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: checkAnim 0.4s ease 0.6s forwards;
}

@keyframes checkAnim {
  to { stroke-dashoffset: 0; }
}

.thanks-title {
  font-size: 34px;
  font-weight: 800;
  color: #1b3a5c;
  margin-bottom: 12px;
}

.thanks-sub {
  font-size: 17px;
  font-weight: 500;
  color: #64b5e2;
  max-width: 440px;
  line-height: 1.5;
}

.thanks-dots {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 28px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #64b5e2;
  animation: dotPulse 1.4s ease-in-out infinite;
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
}

/* Esperando estado */
.waiting-state {
  text-align: center;
  padding: 40px 20px;
}

.waiting-icon {
  color: #c4d9eb;
  animation: iconBreathe 3s infinite ease-in-out;
}

@keyframes iconBreathe {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.08); opacity: 0.8; }
}

.waiting-text {
  font-size: 19px;
  font-weight: 700;
  color: #7da5c4;
  margin-top: 14px;
}

.waiting-sub {
  font-size: 13px;
  color: #a7c1d6;
  margin-top: 4px;
}

/* Footer de pantalla */
.display-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #7da5c4;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.footer-right {
  font-variant-numeric: tabular-nums;
  color: #a7c1d6;
}

/* Config modal */
.config-card {
  width: 400px;
  max-width: 95vw;
  border-radius: 20px !important;
}

/* Settings Gear floating invisible button */
.settings-gear {
  position: absolute;
  top: 15px;
  left: 15px;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.settings-gear:hover {
  opacity: 0.5;
}
</style>
