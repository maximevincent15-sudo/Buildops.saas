import { Eraser } from 'lucide-react'
import { useEffect, useRef } from 'react'
import SignatureCanvas from 'react-signature-canvas'

type Props = {
  value: string | null
  onChange: (dataUrl: string | null) => void
  readOnly?: boolean
}

export function SignaturePad({ value, onChange, readOnly }: Props) {
  const ref = useRef<SignatureCanvas | null>(null)

  // Load existing signature on mount / value change (only if canvas is empty)
  useEffect(() => {
    if (readOnly) return
    const pad = ref.current
    if (!pad) return
    if (value && pad.isEmpty()) {
      // fromDataURL expects the raw data URL; type API exposes a generic
      // method so we cast cautiously
      ;(pad as unknown as { fromDataURL: (url: string) => void }).fromDataURL(value)
    }
  }, [value, readOnly])

  function handleEnd() {
    const pad = ref.current
    if (!pad) return
    if (pad.isEmpty()) {
      onChange(null)
    } else {
      onChange(pad.toDataURL('image/png'))
    }
  }

  function handleClear() {
    ref.current?.clear()
    onChange(null)
  }

  // Mode lecture seule : on affiche l'image si présente
  if (readOnly) {
    if (!value) {
      return (
        <div className="sig-empty">
          Aucune signature enregistrée.
        </div>
      )
    }
    return (
      <div className="sig-display">
        <img src={value} alt="Signature du client" />
      </div>
    )
  }

  return (
    <div className="sig-pad">
      <SignatureCanvas
        ref={ref}
        canvasProps={{ className: 'sig-canvas' }}
        onEnd={handleEnd}
        penColor="#1C2130"
      />
      <div className="sig-hint">Signez dans la zone ci-dessus avec la souris ou le doigt</div>
      <button type="button" className="sig-clear" onClick={handleClear}>
        <Eraser size={12} strokeWidth={2} />
        Effacer
      </button>
    </div>
  )
}
