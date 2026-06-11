import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export const registerSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  siret: z
    .string()
    .min(1, 'SIRET requis')
    .regex(/^\d{14}$/, 'SIRET = 14 chiffres'),
  companyName: z.string().min(1, "Nom d'entreprise requis"),
  email: z.string().min(1, 'Email requis').email('Email valide requis'),
  password: z
    .string()
    .min(10, 'Au moins 10 caractères')
    .regex(/[A-Z]/, 'Au moins 1 majuscule')
    .regex(/[0-9]/, 'Au moins 1 chiffre')
    .regex(/[^A-Za-z0-9]/, 'Au moins 1 caractère spécial (!@#$...)'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
