import { loginSchema, signupSchema } from '../validation';

const valid = { email: 'reader@example.test', password: 'password', nickname: '독자' };

test.each(['', 'reader', 'reader@'])('FR-10 · S-02 이메일 %s는 거절해요', email => {
    expect(loginSchema.safeParse({ ...valid, email }).success).toBe(false);
});

test.each([7, 65])('FR-10 · S-02/S-03 비밀번호 %i자는 거절해요', length => {
    expect(signupSchema.safeParse({ ...valid, password: 'a'.repeat(length) }).success).toBe(false);
});

test.each([8, 64])('FR-10 · S-02/S-03 비밀번호 경계 %i자는 허용해요', length => {
    expect(loginSchema.safeParse({ ...valid, password: 'a'.repeat(length) }).success).toBe(true);
});

test.each(['', '   ', '가'.repeat(31)])('FR-10 · S-03 닉네임 경계 밖 %s는 거절해요', nickname => {
    expect(signupSchema.safeParse({ ...valid, nickname }).success).toBe(false);
});

test.each([1, 30])('FR-10 · S-03 닉네임 경계 %i자는 허용해요', length => {
    expect(signupSchema.safeParse({ ...valid, nickname: '가'.repeat(length) }).success).toBe(true);
});

test('FR-10 · S-03 이메일과 닉네임은 공백을 정리하고 비밀번호 원문은 보존해요', () => {
    expect(signupSchema.parse({ email: ' reader@example.test ', password: ' pass word ', nickname: ' 독자 ' })).toEqual({ email: 'reader@example.test', password: ' pass word ', nickname: '독자' });
});
