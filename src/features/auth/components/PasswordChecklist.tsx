import { Check, Circle } from 'lucide-react'
import { validatePassword, type PasswordRules } from '../passwordRules'

const RULES: { key: keyof PasswordRules; label: string }[] = [
  { key: 'length', label: 'Au moins 10 caractères' },
  { key: 'upper', label: 'Au moins 1 majuscule' },
  { key: 'digit', label: 'Au moins 1 chiffre' },
  { key: 'special', label: 'Au moins 1 caractère spécial (!@#$...)' },
]

type Props = { password: string }

export function PasswordChecklist({ password }: Props) {
  const { rules } = validatePassword(password)
  return (
    <ul className="pw-check">
      {RULES.map(({ key, label }) => {
        const ok = rules[key]
        return (
          <li key={key} className={ok ? 'on' : ''}>
            {ok ? <Check size={12} strokeWidth={2.5} /> : <Circle size={12} strokeWidth={2} />}
            <span>{label}</span>
          </li>
        )
      })}
    </ul>
  )
}
