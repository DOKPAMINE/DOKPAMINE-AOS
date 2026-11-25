import { z } from 'zod';

// FR-10 · S-02/S-03: 인증 입력 계약. 비밀번호는 공백을 포함한 원문을 유지한다.
export const loginSchema = z.object({
    // 기존 이메일 계정도 로그인할 수 있도록 가입 시에만 아이디 형식을 제한한다.
    username: z.string().trim().min(1, '아이디를 입력해 주세요.').max(255, '아이디를 255자 이하로 입력해 주세요.'),
    password: z.string().min(8, '비밀번호는 8자 이상 입력해 주세요.').max(64, '비밀번호는 64자 이하로 입력해 주세요.'),
});

export const signupSchema = loginSchema.extend({
    username: loginSchema.shape.username.pipe(z.string().regex(/^[A-Za-z0-9_]{4,30}$/,
        '아이디는 영문, 숫자, 밑줄을 사용해 4~30자로 입력해 주세요.')),
    nickname: z.string().trim().min(1, '닉네임을 입력해 주세요.').max(30, '닉네임은 30자 이내로 입력해 주세요.'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
