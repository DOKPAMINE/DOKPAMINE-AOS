import { z } from 'zod';

// FR-10 · S-02/S-03: 인증 입력 계약. 비밀번호는 공백을 포함한 원문을 유지한다.
export const loginSchema = z.object({
    email: z.string().trim().pipe(z.email('올바른 이메일을 입력해 주세요.')),
    password: z.string().min(8, '비밀번호는 8~64자로 입력해 주세요.').max(64, '비밀번호는 8~64자로 입력해 주세요.'),
});

export const signupSchema = loginSchema.extend({
    nickname: z.string().trim().min(1, '닉네임을 입력해 주세요.').max(30, '닉네임은 30자 이내로 입력해 주세요.'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
