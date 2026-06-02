export type PasswordRules = {
  length: boolean
  upper: boolean
  digit: boolean
  special: boolean
}

export type PasswordCheck = {
  ok: boolean
  rules: PasswordRules
}

export function validatePassword(pwd: string): PasswordCheck {
  const rules: PasswordRules = {
    length: pwd.length >= 10,
    upper: /[A-Z]/.test(pwd),
    digit: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  }
  return {
    ok: rules.length && rules.upper && rules.digit && rules.special,
    rules,
  }
}
