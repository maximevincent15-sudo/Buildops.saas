import { Camera, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

type Props = {
  onResult: (text: string) => void
  onClose: () => void
  /** Texte d'aide sous la vidéo */
  hint?: string
}

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }

/** Détecteur natif (Chrome Android, Edge…) quand il gère les QR codes, sinon null */
async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
  if (!Ctor) return null
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? []
    if (!formats.includes('qr_code')) return null
    return new Ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/** Lit un QR code dans une image (canvas) avec jsQR, chargé à la demande */
async function decodeWithJsQr(canvas: HTMLCanvasElement): Promise<string | null> {
  const { default: jsQR } = await import('jsqr')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
  return code?.data || null
}

/**
 * Scanner de QR code plein écran : caméra arrière en direct (BarcodeDetector
 * natif, sinon jsQR), avec repli « prendre une photo » si la caméra est
 * refusée ou indisponible.
 */
export function QrScanner({ onResult, onClose, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  function finish(text: string) {
    if (doneRef.current) return
    doneRef.current = true
    if ('vibrate' in navigator) navigator.vibrate?.(60)
    onResult(text)
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: number | undefined
    let alive = true

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('La caméra n\'est pas accessible sur cet appareil. Prends une photo de l\'étiquette à la place.')
        setStarting(false)
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        if (alive) {
          setError('Accès à la caméra refusé. Autorise la caméra pour Firovia dans les réglages, ou prends une photo de l\'étiquette.')
          setStarting(false)
        }
        return
      }
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return }
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})
      setStarting(false)
      const detector = await nativeDetector()

      const tick = async () => {
        if (!alive || doneRef.current) return
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            let text: string | null = null
            if (detector) {
              const found = await detector.detect(video)
              text = found[0]?.rawValue ?? null
            } else {
              const canvas = canvasRef.current!
              const scale = Math.min(1, 720 / video.videoWidth)
              canvas.width = Math.round(video.videoWidth * scale)
              canvas.height = Math.round(video.videoHeight * scale)
              canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
              text = await decodeWithJsQr(canvas)
            }
            if (text) { finish(text); return }
          }
        } catch {
          // image illisible : on réessaie au tour suivant
        }
        timer = window.setTimeout(() => { void tick() }, 160)
      }
      void tick()
    }

    void start()
    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // La caméra ne s'ouvre qu'une fois, à l'affichage du scanner
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = canvasRef.current!
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const text = await decodeWithJsQr(canvas)
      if (text) finish(text)
      else setError('Aucun QR code lisible sur la photo. Recommence en te rapprochant de l\'étiquette.')
    } catch {
      setError('Impossible de lire cette photo.')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#0E1220', display: 'flex', flexDirection: 'column' }} role="dialog" aria-label="Scanner un QR code">
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', color: 'white', gap: 10 }}>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 17 }}>Scanner l'étiquette</span>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: 'white', borderRadius: 999, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {/* Cadre de visée */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 'min(68vw, 300px)', height: 'min(68vw, 300px)', transform: 'translate(-50%, -50%)',
          border: '3px solid rgba(255,255,255,.9)', borderRadius: 22, boxShadow: '0 0 0 9999px rgba(14,18,32,.45)' }} />
        {starting && !error && (
          <p style={{ position: 'absolute', left: 0, right: 0, top: '50%', textAlign: 'center', color: 'white', fontSize: 15 }}>Ouverture de la caméra…</p>
        )}
      </div>

      <div style={{ padding: '14px 16px 22px', color: 'rgba(255,255,255,.85)', fontSize: 14, textAlign: 'center' }}>
        {error ? <p style={{ color: '#FFB4A8', marginBottom: 12 }}>{error}</p> : <p style={{ marginBottom: 12 }}>{hint ?? 'Vise le QR code de l\'étiquette : la lecture est automatique.'}</p>}
        <button type="button" onClick={() => fileRef.current?.click()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'white', color: '#1C2130', border: 'none', borderRadius: 999, padding: '11px 18px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          <Camera size={16} /> Prendre une photo à la place
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => void handlePhoto(e)} style={{ display: 'none' }} />
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
