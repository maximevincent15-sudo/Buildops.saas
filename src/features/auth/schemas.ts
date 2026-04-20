import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export const registerSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  companyName: z.string().min(1, "Nom d'entreprise requis"),
  email: z.string().min(1, 'Email requis').email('Email valide requis'),
  password: z.string().min(8, '8 caractères minimum'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
