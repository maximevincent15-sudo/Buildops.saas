import { Turnstile } from '@marsidev/react-turnstile'
import { TURNSTILE_SITE_KEY } from '../turnstile'

type Props = {
  onToken: (token: string | null) => void
}

export function TurnstileWidget({ onToken }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={(token) => onToken(token)}
        onError={() => onToken(null)}
        onExpire={() => onToken(null)}
        options={{ theme: 'light', size: 'flexible' }}
      />
    </div>
  )
}
